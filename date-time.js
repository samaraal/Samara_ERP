(function(root){
'use strict';
// Presentation only. Store and submit timestamps in their original ISO form.
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true});
function parse(value){
 if(value instanceof Date)return value;
 if(typeof value==='number')return new Date(value);
 let raw=String(value).trim();
 // ERP wall-clock values without an offset refer to Indian local time.
 if(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw))raw=raw.replace(' ','T')+'+05:30';
 return new Date(raw);
}
function parts(value){
 if(value==null||value==='')return null;
 const date=parse(value);
 if(Number.isNaN(date.getTime()))return null;
 return Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
}
function time(value){
 const p=parts(value);
 if(!p)return value==null||value===''?'\u2014':String(value);
 return `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()} IST`;
}
function dateTime(value){
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value.split('-').reverse().join('-');
 const p=parts(value);
 if(!p)return value==null||value===''?'\u2014':String(value);
 return `${p.day}-${p.month}-${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()} IST`;
}
// 2.14.78: ERP-wide standard is DD-MM-YYYY. Besides ISO dates, convert the other shapes
// browsers produce ("28 Sept 2026", "28/09/2026", "Sep 28, 2026", "24-Sep-2026") so any
// screen that formats a date on its own still shows DD-MM-YYYY.
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const pad=n=>String(n).padStart(2,'0');
function dmy(d,m,y){d=Number(d);m=Number(m);if(!(d>=1&&d<=31&&m>=1&&m<=12))return null;return pad(d)+'-'+pad(m)+'-'+y}
function clock(hh,mm,ap){return hh?', '+pad(Number(hh)%12||12)+':'+mm+' '+ap.toUpperCase():''}
const MON='(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const TIME='(?:,?\\s*(?:at\\s+)?(\\d{1,2}):(\\d{2})(?::\\d{2})?\\s*([ap]\\.?m\\.?))?';
const SLASH=new RegExp('\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b'+TIME,'gi');
const DAY_MON=new RegExp('\\b(\\d{1,2})[ -]'+MON+'[ ,-]+(\\d{4})\\b'+TIME,'gi');
const MON_DAY=new RegExp('\\b'+MON+' (\\d{1,2}),? (\\d{4})\\b'+TIME,'gi');
const ampm=v=>v?v.replace(/\./g,''):v;
function text(value){
 if(typeof value!=='string')return value;
 // Match the entire instant before formatting date-only fragments.
 return value.replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g,stamp=>dateTime(stamp))
  .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1')
  .replace(SLASH,(all,d,m,y,hh,mm,ap)=>{const v=dmy(d,m,y);return v?v+clock(hh,mm,ampm(ap)):all})
  .replace(DAY_MON,(all,d,mon,y,hh,mm,ap)=>{const v=dmy(d,MONTHS[mon.slice(0,3).toLowerCase()],y);return v?v+clock(hh,mm,ampm(ap)):all})
  .replace(MON_DAY,(all,mon,d,y,hh,mm,ap)=>{const v=dmy(d,MONTHS[mon.slice(0,3).toLowerCase()],y);return v?v+clock(hh,mm,ampm(ap)):all});
}

// 2.14.78: every date / date-time box in the ERP shows DD-MM-YYYY, whatever the phone or
// Windows language. A plain <input type="date"> shows the device's own format (often
// MM/DD/YYYY), so each one is drawn as a DD-MM-YYYY text box with the native calendar
// picker laid invisibly on top. The saved value is unchanged (YYYY-MM-DD / YYYY-MM-DDThh:mm).
function installDateBoxes(){
 const R=root.React;
 if(!R||R.__samaraDateBoxes)return;
 const original=R.createElement;
 try{
  const css=document.createElement('style');
  css.id='samara-date-box-css';
  css.textContent='.samara-date-box{position:relative;display:inline-block;vertical-align:middle;max-width:100%;min-width:0}'+
   '.field .samara-date-box,label .samara-date-box,.samara-date-box.is-block{display:block;width:100%}'+
   '.samara-date-box>input[type=text]{width:100%;box-sizing:border-box}'+
   '.leave-calendar-controls .samara-date-box{flex:0 1 180px;min-width:160px}'+
   '@media(max-width:760px){.leave-calendar-controls .samara-date-box,table.samara-mobile-card-table td>.samara-date-box{display:block;width:100%;min-width:0}}';
  (document.head||document.documentElement).appendChild(css);
 }catch(_e){}
 function shownValue(kind,value){
  if(!value)return '';
  const raw=String(value);
  if(kind==='date'){const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'-'+m[2]+'-'+m[1]:raw}
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!m)return raw;
  const hr=Number(m[4]);
  return m[3]+'-'+m[2]+'-'+m[1]+', '+pad(hr%12||12)+':'+m[5]+' '+(hr>=12?'PM':'AM');
 }
 function SamaraDateBox(props){
  const {__kind,style,className,placeholder,disabled,readOnly,onClick,...rest}=props;
  const s=style||{};
  const box={};if(s.width)box.width=s.width;
  ['minWidth','maxWidth','flex','flexBasis','margin','marginTop','marginBottom','gridColumn'].forEach(k=>{if(s[k]!==undefined)box[k]=s[k]});
  const openPicker=event=>{
   if(onClick)onClick(event);
   if(disabled||readOnly||event.defaultPrevented)return;
   try{event.currentTarget.showPicker&&event.currentTarget.showPicker()}catch(_e){}
  };
  return original('span',{className:'samara-date-box'+(disabled?' is-disabled':''),style:box},
   original('input',{type:'text',readOnly:true,tabIndex:-1,'aria-hidden':'true',className,disabled,
    value:shownValue(__kind,rest.value),
    placeholder:__kind==='date'?'DD-MM-YYYY':'DD-MM-YYYY, hh:mm AM/PM',
    style:{...s,width:'100%',maxWidth:'100%',margin:0,paddingRight:'34px',boxSizing:'border-box',cursor:disabled?'default':'pointer'}}),
   original('span',{'aria-hidden':'true',style:{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:'15px',opacity:disabled?.4:.8}},'\u25BE'),
   original('input',{...rest,type:__kind,'data-samara-native':'1',disabled,readOnly,onClick:openPicker,
    'aria-label':rest['aria-label']||placeholder||(__kind==='date'?'Choose date (DD-MM-YYYY)':'Choose date and time'),
    style:{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,margin:0,padding:0,border:0,cursor:disabled?'default':'pointer'}})
  );
 }
 R.createElement=function(type,props){
  if(type==='input'&&props&&(props.type==='date'||props.type==='datetime-local')&&!props['data-samara-native']&&props.value!==undefined&&props.ref==null){
   const args=Array.prototype.slice.call(arguments,2);
   const {type:kind,...rest}=props;
   return original.apply(R,[SamaraDateBox,{...rest,__kind:kind}].concat(args));
  }
  return original.apply(R,arguments);
 };
 R.__samaraDateBoxes=true;
}
if(root.document)installDateBoxes();
const api=Object.freeze({dateTime,time,text});
root.SamaraDateTime=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
