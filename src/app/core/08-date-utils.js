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

