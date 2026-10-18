  // 2.18.0: Document scan in the live ERP (moved from the Scan Lab trial, tested there 17–18 Oct 2026).
  //   * Admission: prescription → Section 3 medicine rows; ID card → Guest name / DOB / gender / address.
  //   * Stores: supplier bill → Receive from Vendor lines.
  // The AI only READS (Edge Functions prescription-scan / store-scan); staff check and verify every value
  // before anything is saved. Who may scan = who can already use that form.
  const SAMARA_SCAN = (()=>{
    const MEAL_TIMES={'Before food':['07:00','12:00','19:00'],'After food':['09:00','14:00','21:00'],'With food':['08:00','13:00','20:00'],'No restriction':['09:00','14:00','21:00']};
    const BEDTIME='22:00';
    const FREQUENCIES=['Once Daily (OD)','Twice Daily (BD)','Three Times Daily (TDS)','Four Times Daily (QID)','HS','STAT','SOS / PRN','Weekly','Monthly'];
    const ROUTES=['Oral','IV','IM','Subcutaneous','Topical','Inhalation','Nasal','Other'];
    const FOODS=['Before food','After food','With food','No restriction'];
    const DURATIONS=['Single Dose','1 Day','3 Days','5 Days','7 Days','10 Days','14 Days','21 Days','30 Days','Until Doctor Review','Long Term','Custom'];
    const UNITS=['mg','mcg','g','ml','mg/ml','mg/5 ml','IU','units','%','drops','tablet','capsule','puff','sachet','patch'];
    const VARIABLE_DOSE_RE=/sliding\s*scale|depend(ing|s)?\s+on\s+(the\s+)?(blood\s*)?sugar|(as\s+per|according\s+to)\s+(the\s+)?(blood\s*)?sugar|\b(grbs|cbg|rbs)\b|blood\s*sugar|sugar\s*level|as\s+directed\s+by\s+(the\s+)?doctor/i;
    const INSULIN_RE=/insulin|actrapid|mixtard|lantus|novorapid|novomix|humalog|huminsulin|insugen|basalog|tresiba|ryzodeg|levemir|apidra|glargine|aspart|lispro|degludec|detemir|wosulin/i;
    const FIELD_MAP={strength:'strength',dose:'strength',strength_amount:'strength',strength_unit:'strength',time:'times',times:'times',dose_pattern:'times',frequency:'frequency',route:'route',food:'food_instruction',food_instruction:'food_instruction',duration:'duration',custom_duration_days:'custom_duration_days',medicine_name:'medicine_name',name:'medicine_name',special_instruction:'special_instruction',doctor_name:'prescribed_by_doctor',prescribed_by_doctor:'prescribed_by_doctor'};
    const LABEL={prescribed_by_doctor:'Prescribed Doctor',medicine_name:'Medicine',strength:'Strength',frequency:'Frequency',times:'Time',route:'Route',food_instruction:'Food',duration:'Duration',custom_duration_days:'Custom days',special_instruction:'Special instruction'};
    const blobToB64=blob=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=rej;r.readAsDataURL(blob)});
    const loadImage=url=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const isPdf=f=>f&&(f.type==='application/pdf'||/\.pdf$/i.test(f.name||''));
    // Phone photos are shrunk (longest side 2400 px) before sending; handwriting stays readable.
    async function payload(file){
      if(isPdf(file)){if(file.size>10*1024*1024)throw new Error(`${file.name} is larger than 10 MB. Upload a smaller PDF or photos of the pages.`);return {mime:'application/pdf',data:await blobToB64(file)}}
      const url=URL.createObjectURL(file);
      try{
        const bmp=await loadImage(url);const scale=Math.min(1,2400/Math.max(bmp.width,bmp.height));
        const c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);
        const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0,c.width,c.height);
        const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',0.9));if(blob)return {mime:'image/jpeg',data:await blobToB64(blob)};
      }catch(_){}finally{URL.revokeObjectURL(url)}
      return {mime:/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)?file.type:'image/jpeg',data:await blobToB64(file)};
    }
    function usable(files){
      const list=Array.from(files||[]).filter(f=>isPdf(f)||/^image\//.test(f.type||''));
      if(!list.length)throw new Error('Choose a photo or PDF of the document.');
      if(list.length>8)throw new Error('At most 8 pages at a time.');
      return list;
    }
    async function invoke(fn,body){
      const {data,error}=await client.functions.invoke(fn,{body});
      if(error){
        let msg='Could not read the document just now. Please try again.',code='';
        try{const j=await error.context.json();if(j?.error)msg=j.error;code=j?.code||''}catch(_){if(error.context?.status===504)msg='This page took too long to read. Try again, or take a closer photo with fewer lines.'}
        if(code==='AUTH')msg='Your ERP login has expired. Please sign in again and scan once more.';
        throw new Error(msg);
      }
      if(!data?.result)throw new Error(data?.error||'Nothing was read from the document.');
      return data.result;
    }
    // Several prescription pages are read at the same time, one request per page (dense hospital pages in one
    // request ran past the 150-second server limit). Returns {results:[...], failed:[page numbers]}.
    async function readPrescription(files){
      const list=usable(files);const pays=[];for(const f of list)pays.push(await payload(f));
      const call=fs=>invoke('prescription-scan',{kind:'prescription',files:fs});
      const settled=list.length>1?await Promise.allSettled(pays.map(p=>call([p]))):[{status:'fulfilled',value:await call(pays)}];
      const failed=settled.map((r,i)=>r.status==='rejected'?i+1:0).filter(Boolean);
      if(failed.length===settled.length)throw settled[0].reason;
      return {results:settled.map((r,i)=>r.status==='fulfilled'?{...r.value,__page:i+1}:null).filter(Boolean),failed,pages:list.length,
        failReason:failed.length?String(settled.find(r=>r.status==='rejected').reason?.message||''):''};
    }
    async function readId(files){const list=usable(files);const pays=[];for(const f of list)pays.push(await payload(f));return invoke('prescription-scan',{kind:'id',files:pays})}
    async function readBill(files){const list=usable(files);const pays=[];for(const f of list)pays.push(await payload(f));return invoke('store-scan',{files:pays})}

    // ---------- prescription → Admission medicine rows ----------
    function parseSlots(pattern){
      const t=String(pattern||'').replace(/½/g,'0.5').replace(/\b1\/2\b/g,'0.5').replace(/¼/g,'0.25');
      const parts=t.split(/\s*[-–—]\s*/).filter(x=>x!=='');if(parts.length<3||parts.length>4)return null;
      const nums=parts.map(Number);return nums.every(Number.isFinite)?nums:null;
    }
    function timesFor(frequency,pattern,food){
      const meal=MEAL_TIMES[food]||MEAL_TIMES['After food'];
      if(frequency==='HS')return [BEDTIME];
      if(frequency==='STAT'||frequency==='SOS / PRN')return [];
      const slots=parseSlots(pattern);
      if(slots){const t=slots.map((n,i)=>n>0?(i<3?meal[i]:BEDTIME):null).filter(Boolean);if(t.length)return [...new Set(t)].sort()}
      switch(frequency){
        case 'Once Daily (OD)':case 'Weekly':case 'Monthly':return [meal[0]];
        case 'Twice Daily (BD)':return [meal[0],meal[2]];
        case 'Three Times Daily (TDS)':return meal.slice();
        case 'Four Times Daily (QID)':return [...meal,BEDTIME];
        default:return [];
      }
    }
    function freqFromPattern(pattern){
      const slots=parseSlots(pattern);if(!slots)return '';
      const n=slots.filter(x=>x>0).length;if(slots.length===4&&n===4)return 'Four Times Daily (QID)';
      return ({1:'Once Daily (OD)',2:'Twice Daily (BD)',3:'Three Times Daily (TDS)'})[n]||'';
    }
    const baseName=name=>String(name||'').toLowerCase()
      .replace(/\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syr|syrup|susp|suspension|inj|injection|oint|ointment|cream|gel|drops?|inhaler|rotacaps?|sachet)\b\.?/g,' ')
      .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|%|units?)?/g,' ').replace(/[^a-z ]+/g,' ').replace(/\s+/g,' ').trim();
    // Returns {rows, meta, notes}. Each row = an Admission medicine row + row.scan {raw, flags, notes, confidence, verified}.
    function prescriptionToMedicines(reading,existingNames){
      const known=new Set((existingNames||[]).map(baseName).filter(Boolean));
      const rows=[],metas=[],notes=[];
      for(const r of reading.results){
        const meta={doctor:String(r.doctor_name||'').trim(),hospital:String(r.hospital_or_clinic||'').trim(),date:String(r.prescription_date||'').trim(),patient:String(r.patient_name_on_prescription||'').trim(),poor:r.page_quality==='poor',page:r.__page};
        metas.push(meta);notes.push(...(Array.isArray(r.other_notes)?r.other_notes:[]));
        const perMedDoctor=(r.medicines||[]).some(m=>String(m.doctor_name||'').trim());
        for(const m of (r.medicines||[])){
          const flags=new Set((m.unclear_fields||[]).map(f=>FIELD_MAP[String(f).toLowerCase()]).filter(Boolean));const why={};
          const bedtimeWords=/\b(hs|h\.s\.?|bed\s*time|at\s+bed)\b/i.test(`${m.raw_text||''} ${m.special_instruction||''}`);
          const s0=parseSlots(m.dose_pattern);const nightOnly=s0&&s0.length===3&&!s0[0]&&!s0[1]&&s0[2]>0;
          // "0-0-1" without bedtime words is the after-dinner dose (9 PM), not HS.
          let frequency=(m.frequency==='HS'&&nightOnly&&!bedtimeWords)?'Once Daily (OD)':(FREQUENCIES.includes(m.frequency)?m.frequency:freqFromPattern(m.dose_pattern));
          if(!frequency){flags.add('frequency');frequency='Once Daily (OD)'}
          const food=FOODS.includes(m.food_instruction)?m.food_instruction:'After food';
          const times=timesFor(frequency,m.dose_pattern,food);
          if(!times.length&&!['SOS / PRN','STAT'].includes(frequency))flags.add('times');
          const dose=String(m.dose_per_time||'').trim();const plainOne=/^1\s*(tab|tablet|cap|capsule)s?\.?$/i.test(dose);
          const variable=!m.strength_amount&&VARIABLE_DOSE_RE.test(`${m.raw_text||''} ${m.special_instruction||''}`);
          const insulinUnits=!variable&&!m.strength_amount&&INSULIN_RE.test(m.medicine_name||'')?(dose.match(/^(\d+(?:\.\d+)?)\s*(?:iu|units?|u)\b/i)||[])[1]:'';
          const amount=String(variable?'':(m.strength_amount||insulinUnits||'')).trim();
          const unit=insulinUnits?'units':(UNITS.includes(m.strength_unit)?m.strength_unit:'');
          const special=[variable?'Dose varies — as per blood sugar / doctor’s scale':'',dose&&!plainOne?`Dose: ${dose} each time`:'',String(m.special_instruction||'').trim()].filter(Boolean).join('. ');
          const doctor=perMedDoctor?String(m.doctor_name||'').trim():meta.doctor;
          const duration=DURATIONS.includes(m.duration)?m.duration:'Long Term';
          const row={...blankMedicine(),
            prescribed_by_doctor:doctor,medicine_name:String(m.medicine_name||'').trim(),
            strength:amount&&unit?`${amount} ${unit}`:amount,
            frequency,route:ROUTES.includes(m.route)?m.route:'Oral',food_instruction:food,times:times.join(', '),
            duration,custom_duration_days:duration==='Custom'?String(m.custom_duration_days||''):'',
            special_instruction:special,is_locked:true};
          if(!doctor){flags.add('prescribed_by_doctor');why.prescribed_by_doctor='Not printed — enter the doctor'}
          if(!row.medicine_name)flags.add('medicine_name');
          if(variable){flags.add('strength');why.strength='Dose varies (sliding scale) — enter the dose the doctor wants recorded; the scale is in Special instruction'}
          else if(!(amount&&unit)){flags.add('strength');why.strength=amount?'Choose the unit':'Not clear — enter the strength'}
          if(insulinUnits){flags.add('strength');why.strength=`Insulin: ${insulinUnits} units each time — check`}
          if(!m.route)flags.add('route');
          if(!m.food_instruction){flags.add('food_instruction');why.food_instruction='Not written — confirm'}
          if(!m.duration){flags.add('duration');why.duration='Not written — pre-set to Long Term'}
          if(known.has(baseName(row.medicine_name))){flags.add('medicine_name');why.medicine_name='Already in the list — remove one if it is the same medicine'}
          known.add(baseName(row.medicine_name));
          row.scan={raw:String(m.raw_text||'').trim(),flags:[...flags],notes:why,confidence:['high','medium','low'].includes(m.confidence)?m.confidence:'low',verified:false,page:meta.page};
          rows.push(row);
        }
      }
      return {rows,metas,notes};
    }

    // ---------- ID card → Admission Guest fields ----------
    const norm=v=>String(v||'').toLowerCase().replace(/[^a-z]/g,'');
    // Tamil spellings vary (Thoothukkudi / Thoothukudi / Tuticorin): compare without "h", doubled letters and spaces.
    const loose=v=>norm(v).replace(/h/g,'').replace(/(.)\1+/g,'$1').replace(/[aeiou]+$/,'');
    const ALIAS={tuticorin:'Thoothukudi',trichy:'Tiruchirappalli',tiruchi:'Tiruchirappalli',trichirappalli:'Tiruchirappalli',kanyakumari:'Kanniyakumari',nilgiris:'The Nilgiris',ooty:'The Nilgiris',villupuram:'Viluppuram',kanchipuram:'Kancheepuram',tirupur:'Tiruppur',sivagangai:'Sivaganga',nagai:'Nagapattinam',tanjore:'Thanjavur',madras:'Chennai',kovai:'Coimbatore',pondicherry:'Puducherry',tamilnadu:'Tamil Nadu'};
    function bestOf(value,options){
      const v=norm(value);if(!v)return '';
      const exact=options.find(o=>norm(o)===v);if(exact)return exact;
      const al=ALIAS[v];if(al&&options.includes(al))return al;
      const lv=loose(value);const same=options.filter(o=>loose(o)===lv);if(same.length===1)return same[0];
      const part=options.filter(o=>norm(o).startsWith(v)||v.startsWith(norm(o)));if(part.length===1)return part[0];
      // one or two letters different (e.g. Srivaikundam / Srivaikuntam)
      const lev=(a,b)=>{const m=a.length,n=b.length;let prev=Array.from({length:n+1},(_,j)=>j);for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur}return prev[n]};
      const close=options.filter(o=>lv.length>=5&&lev(loose(o),lv)<=2);return close.length===1?close[0]:'';
    }
    function idToGuest(r){
      const iso=(()=>{const m=String(r.date_of_birth||'').match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);if(!m)return '';const d=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return Number.isNaN(new Date(d+'T00:00:00Z').getTime())?'':d})();
      const out={},notes=[];
      const put=(k,v)=>{v=String(v||'').trim();if(v)out[k]=v};
      put('full_name',String(r.full_name||'').toUpperCase());
      if(iso)out.date_of_birth=iso;
      else if(/^\d{4}$/.test(String(r.year_of_birth||''))){out.age=String(new Date().getFullYear()-Number(r.year_of_birth));notes.push(`Only the year of birth (${r.year_of_birth}) is printed — age set to about ${out.age}.`)}
      if(['Male','Female','Other'].includes(r.gender))out.gender=r.gender;
      const GA=window.SamaraGuestAddress;
      let country=String(r.country||'').trim()||(/aadhaar|pan|voter|driving/i.test(r.document_type||'')||(GA&&bestOf(r.state,GA.INDIAN_STATES))?'India':'');
      if(GA&&country)country=GA.COUNTRIES.find(c=>norm(c)===norm(country))||country;
      if(country)out.country=country;
      if(country==='India'&&GA){
        const st=bestOf(r.state,GA.INDIAN_STATES);if(st)out.state=st;else if(r.state)notes.push(`State "${r.state}" — choose it from the list.`);
        if(st==='Tamil Nadu'){
          const map=window.SamaraTNDistrictTaluks||{};const dist=bestOf(r.district,Object.keys(map));
          if(dist){out.district=dist;const tk=bestOf(r.taluk,map[dist]||[]);if(tk)out.taluk=tk;else if(r.taluk)notes.push(`Taluk "${r.taluk}" — choose it from the list.`)}
          else if(r.district)notes.push(`District "${r.district}" — choose it from the list.`);
        }else{put('district',r.district);put('taluk',r.taluk)}
      }else{put('state',r.state);put('district',r.district);put('taluk',r.taluk)}
      for(const k of ['village_town','locality_area','street_name','house_no','apartment_name'])put(k,r[k]);
      const pin=String(r.pincode||'').replace(/\D/g,'');if(pin)out.pincode=country==='India'?pin.slice(0,6):pin;
      const relation=r.relation_type&&r.relation_name?`${r.relation_type} ${r.relation_name}`:'';
      return {fields:out,notes,relation,documentType:String(r.document_type||'').trim(),last4:String(r.id_last4||'').trim()};
    }

    // ---------- shared upload button ----------
    // onFiles(files) is called with the chosen pages. beforePick() runs before the file picker opens (Admission
    // saves its draft first, because a phone camera can reload the page).
    // 2.18.2: pages are collected first (front + back of an ID card, several prescription / bill pages), shown as
    // thumbnails, then read together with the Read button — the same as the Scan Lab trial. "Clear" empties the pages.
    function ScanButton({label,readLabel,busy,status,tone,onFiles,beforePick,disabled,maxPages=8}){
      const [pages,setPages]=React.useState([]);
      React.useEffect(()=>()=>pages.forEach(p=>URL.revokeObjectURL(p.url)),[]);
      const add=list=>{
        const ok=Array.from(list||[]).filter(f=>isPdf(f)||/^image\//.test(f.type||''));
        setPages(cur=>[...cur,...ok.map(f=>({file:f,url:URL.createObjectURL(f),pdf:isPdf(f)}))].slice(0,maxPages));
      };
      const remove=i=>setPages(cur=>{URL.revokeObjectURL(cur[i].url);return cur.filter((_,n)=>n!==i)});
      const clearAll=()=>{pages.forEach(p=>URL.revokeObjectURL(p.url));setPages([])};
      const off=busy||disabled;const n=pages.length;
      const pick=(text,cls,extra)=>h('label',{className:`btn ${cls} file-button${off||n>=maxPages?' disabled':''}`,style:{margin:0}},text,
        h('input',{type:'file',accept:'image/*,.pdf',disabled:off||n>=maxPages,...extra,onClick:()=>beforePick&&beforePick(),onChange:e=>{const f=Array.from(e.target.files||[]);e.target.value='';if(f.length)add(f)}}));
      return h('div',{className:'samara-scan-box'},
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},
          pick(n?'+ Add more pages':`📷 ${label}`,n?'btn-secondary':'btn-primary',{multiple:true}),
          pick(n?`+ Photo of page ${n+1}`:'Camera','btn-secondary',{capture:'environment'}),
          n?h('button',{type:'button',className:'btn btn-secondary',disabled:off,onClick:clearAll},'Clear'):null),
        n?h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'10px 0'}},pages.map((p,i)=>h('div',{key:p.url,style:{position:'relative',width:'84px',textAlign:'center'}},
          p.pdf?h('div',{style:{width:'84px',height:'84px',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid #e2c9d6',borderRadius:'8px',background:'#fff',fontWeight:700,color:'#7a1247'}},'PDF')
            :h('a',{href:p.url,target:'_blank',rel:'noopener'},h('img',{src:p.url,alt:`Page ${i+1}`,style:{width:'84px',height:'84px',objectFit:'cover',border:'1px solid #e2c9d6',borderRadius:'8px',display:'block'}})),
          h('small',null,`Page ${i+1}`),
          h('button',{type:'button','aria-label':`Remove page ${i+1}`,disabled:off,onClick:()=>remove(i),style:{position:'absolute',top:'-6px',right:'-6px',width:'22px',height:'22px',borderRadius:'50%',border:'none',background:'#b3134f',color:'#fff',fontWeight:700,cursor:'pointer',lineHeight:'20px',padding:0}},'×')))):null,
        n?h('button',{type:'button',className:'btn btn-primary',disabled:off,style:{width:'100%',marginTop:'2px'},onClick:()=>onFiles(pages.map(p=>p.file))},busy?'Reading…':`✨ ${readLabel||'Read'}${n>1?` (${n} pages)`:''}`):null,
        status?h('div',{role:'status',style:scanNoteStyle(tone)},status):null);
    }
    // Plain styled note (not the ERP "message success" class, which the app turns into a "Saved" toast).
    function scanNoteStyle(tone){return {marginTop:'8px',padding:'10px 12px',borderRadius:'10px',fontWeight:600,lineHeight:1.4,
      background:tone==='error'?'#fdecea':tone==='ok'?'#e8f6ee':'#f4f1f6',color:tone==='error'?'#9b1c1c':tone==='ok'?'#14532d':'#4a3a55',border:`1px solid ${tone==='error'?'#f5b5ae':tone==='ok'?'#a7dcbc':'#e2d8ea'}`}}
    // Ticks a "Reading… N s" counter while fn runs.
    async function withTimer(setStatus,text,fn){
      const t0=Date.now();const tick=setInterval(()=>setStatus(`${text} ${Math.round((Date.now()-t0)/1000)} s`),500);
      try{return await fn()}finally{clearInterval(tick)}
    }
    return {readPrescription,readId,readBill,prescriptionToMedicines,idToGuest,ScanButton,withTimer,noteStyle:scanNoteStyle,LABEL,timesFor,baseName};
  })();
