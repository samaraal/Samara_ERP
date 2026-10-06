// Keep the room's master effective date in the audit record, but show when it
// applies to this resident. Presentation only: never rewrite financial entries.
function residentTariffDate(effective,admission){
  const valid=value=>{const day=String(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:'';};
  const start=valid(effective),admitted=valid(admission);
  return start&&admitted?(start<admitted?admitted:start):start;
}
function residentTariffDescription(row,admission){
  const text=String(row?.description||'');
  if(!/^Tariff adjustment for /i.test(text))return text;
  return text.replace(/\beffective (\d{2})-(\d{2})-(\d{4})\b/i,(match,dd,mm,yyyy)=>{
    const day=residentTariffDate(`${yyyy}-${mm}-${dd}`,admission);
    return day?`applicable from ${day.slice(8,10)}-${day.slice(5,7)}-${day.slice(0,4)}`:match;
  });
}

// ── Simple bill lines (v2.15.76) ─────────────────────────────────────────────
// KEEP IN STEP WITH the Family Portal (js/family-app-v1.0.6.js familyParticulars /
// familyBillingLines): the ERP bill and the Family Portal must show the same lines.
// Item name only — no Accounts names, approval remarks or internal discount notes.
function billIsAdvance(row){
  const type=String(row?.transaction_type||'').toLowerCase();
  return type==='advance'||(type==='payment'&&/advance/i.test(String(row?.category||'')));
}
function billRupees(v){const n=Number(v);return Number.isFinite(n)?'₹'+n.toLocaleString('en-IN',{maximumFractionDigits:2}):String(v);}
function billItemName(row){
  const type=String(row?.transaction_type||'').toLowerCase();
  const cat=String(row?.category||'').trim();
  const text=String(row?.description||'').trim();
  const parts=text.split(' · ').map(x=>x.trim()).filter(Boolean);
  let m=text.match(/^(?:Automatic )?room rent for (\d{2}-\d{2}-\d{4})(?: \(([^)]*)\))?(?: · Room ([^ ·]+))?/i);
  if(m){const room=m[3]||((m[2]||'').match(/Room ([^ ,)]+)/i)||[])[1];return `Room rent · ${m[1]}${room?` · Room ${room}`:''}`;}
  m=text.match(/^(?:Automatic )?(daily )?(special )?nurs\w* charge for (\d{2}-\d{2}-\d{4})/i);
  if(m)return `${m[2]?'Special nurse':'Nursing'} charge · ${m[3]}`;
  m=text.match(/^Tariff adjustment for (\d{2}-\d{2}-\d{4}) · Room (\S+)(?: · [^·]*)? · ([\d.]+) → ([\d.]+)/i);
  if(m)return `Room tariff adjustment · ${m[1]} · Room ${m[2]} (${billRupees(m[3])} → ${billRupees(m[4])} per day)`;
  if(type==='payment'||type==='advance'){
    const ref=(text.match(/Reference:\s*([^·]+)/i)||[])[1];
    const label=billIsAdvance(row)?'Advance received':'Payment received';
    return ref?`${label} · Ref ${ref.trim()}`:label;
  }
  if(type==='discount')return cat?`Discount · ${cat}`:'Discount';
  if(type==='refund')return 'Refund';
  return parts[0]||cat||'Charge';
}
function billQty(v){const n=Number(v);return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);}
// Item name, plus "(2 × ₹30)" when the charge came with a quantity (see attachBillUnits).
function billLineLabel(row){
  const name=billItemName(row);
  const q=Number(row?.bill_quantity),p=Number(row?.bill_unit_price);
  return q>0&&p>0?`${name} (${billQty(q)} × ${billRupees(p)})`:name;
}
// One line per item and price for a group of charge rows:
// "Examination Gloves (17 × ₹30), Glucometer Strips (2 × ₹50)" (or "Item × 3" when no quantity is known).
function billItemsSummary(items){
  const groups=new Map();
  for(const it of items||[]){
    const name=billItemName(it),q=Number(it?.bill_quantity),p=Number(it?.bill_unit_price);
    const unit=q>0&&p>0;const key=unit?`${name}|${p}`:`${name}|-`;
    const g=groups.get(key)||{name,unit,price:p,qty:0,count:0};g.qty+=unit?q:0;g.count+=1;groups.set(key,g);
  }
  return [...groups.values()].map(g=>g.unit?`${g.name} (${billQty(g.qty)} × ${billRupees(g.price)})`:(g.count>1?`${g.name} × ${g.count}`:g.name)).join(', ')||'—';
}
// Itemised lines for one charge category, always Qty × Rate = Amount (Final Bill):
//  • daily charges → "Room rent (30-09-2026 to 01-10-2026)" 2 days × ₹3,200
//  • Bills & Charges items → "Examination Gloves" 17 × ₹30 (no recorded quantity: entries × amount)
function billChargeLines(items){
  const daily=[],other=new Map(),out=[];
  for(const it of items||[]){
    const name=billItemName(it);
    const m=name.match(/^(Room rent|Nursing charge|Special nurse charge) · (\d{2})-(\d{2})-(\d{4})/);
    if(m){daily.push({kind:m[1],iso:`${m[4]}-${m[3]}-${m[2]}`,amount:Number(it.amount||0)});continue;}
    const q=Number(it?.bill_quantity),p=Number(it?.bill_unit_price),unit=q>0&&p>0;
    const amt=Number(it.amount||0),rate=unit?p:amt,key=`${name}|${rate}`;
    const g=other.get(key)||{label:name,qty:0,rate,amount:0,unit:''};
    g.qty+=unit?q:1;g.amount+=amt;other.set(key,g);
  }
  const dmy=iso=>`${iso.slice(8,10)}-${iso.slice(5,7)}-${iso.slice(0,4)}`;
  daily.sort((a,b)=>a.kind.localeCompare(b.kind)||a.iso.localeCompare(b.iso));
  let run=null;
  const flush=()=>{if(!run)return;out.push({label:run.from===run.to?`${run.kind} (${dmy(run.from)})`:`${run.kind} (${dmy(run.from)} to ${dmy(run.to)})`,qty:run.n,rate:run.rate,amount:run.n*run.rate,unit:run.n===1?'day':'days'});run=null;};
  for(const d of daily){
    const next=run&&run.kind===d.kind&&Math.abs(run.rate-d.amount)<0.005&&Date.parse(d.iso)-Date.parse(run.to)<=86400000;
    if(next){run.to=d.iso;run.n+=1;}else{flush();run={kind:d.kind,from:d.iso,to:d.iso,n:1,rate:d.amount};}
  }
  flush();
  return out.concat([...other.values()]);
}
// Adds bill_quantity / bill_unit_price from Bills & Charges requests to billing rows.
// Staff names, approvals and remarks stay in bill_charge_requests (internal, time-stamped).
async function attachBillUnits(rows,patientId){
  try{
    if(!patientId||!(rows||[]).some(r=>r.transaction_type==='Charge'))return rows||[];
    const {data,error}=await client.from('bill_charge_requests').select('billing_transaction_id,quantity')
      .eq('patient_id',patientId).not('billing_transaction_id','is',null);
    if(error||!Array.isArray(data))return rows;
    const byId=new Map(data.map(r=>[String(r.billing_transaction_id),Number(r.quantity)]));
    return rows.map(row=>{
      const q=byId.get(String(row.id));const amt=Number(row.amount||0);
      return q>0&&amt>0&&row.transaction_type==='Charge'?{...row,bill_quantity:q,bill_unit_price:Math.round(amt/q*100)/100}:row;
    });
  }catch(_){return rows||[];}
}
  const localDateTimeValue = (date=new Date()) => {
    const value=date instanceof Date?date:new Date(date);
    const safe=Number.isNaN(value.getTime())?new Date():value;
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Kolkata',
      year:'numeric',
      month:'2-digit',
      day:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      hour12:false
    }).formatToParts(safe);
    const get=type=>parts.find(part=>part.type===type)?.value||'00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  };

  const todayISOIndia = () => {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=type=>parts.find(part=>part.type===type)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const parseISODateUTC = dateStr => {
    const [year,month,day]=String(dateStr||'').slice(0,10).split('-').map(Number);
    return new Date(Date.UTC(year,month-1,day));
  };
  const addDaysISO = (dateStr,days) => {
    const d=parseISODateUTC(dateStr);
    d.setUTCDate(d.getUTCDate()+days);
    return d.toISOString().slice(0,10);
  };
  const mondayOfWeek = dateStr => {
    const d=parseISODateUTC(dateStr);
    const day=d.getUTCDay();
    d.setUTCDate(d.getUTCDate()+(day===0?-6:1-day));
    return d.toISOString().slice(0,10);
  };
  const isFutureDateIndia = value => Boolean(value&&String(value).slice(0,10)>todayISOIndia());
  // 2.15.12: completed years from a Date of Birth (India date). null if empty, invalid or in the future.
  const ageFromDateOfBirth = value => {
    const dob=String(value||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||dob>todayISOIndia())return null;
    const [y,m,d]=dob.split('-').map(Number);const [ty,tm,td]=todayISOIndia().split('-').map(Number);
    const years=ty-y-((tm<m||(tm===m&&td<d))?1:0);
    return years>=0&&years<=130?years:null;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[ch]));
  const whatsappNumber = value => { const digits=String(value||'').replace(/\D/g,''); if(!digits)return ''; if(digits.length===10)return `91${digits}`; if(digits.length===11&&digits.startsWith('0'))return `91${digits.slice(1)}`; return digits; };
  const whatsappWelcomeUrl = row => {
    const number=whatsappNumber(row.mobile); if(!number||!String(row.login_id||'').trim())return '';
    const text=`Dear ${formalName(row)||row.full_name||'Colleague'},

Your Samara Care ERP login details:
Employee ID: ${row.employee_id||'Please contact HR'}
Login ID: ${row.login_id}
Samara Care ERP: https://app.samaraassistedliving.com/

Please use the password provided by HR. Contact HR if you need help signing in.

https://samaraassistedliving.com/`;
    return `https://wa.me/${number}?text=${encodeURIComponent(brandWhatsAppText(text))}`;
  };

