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

