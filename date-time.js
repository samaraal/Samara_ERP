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
 if(!p)return value==null||value===''?'â€”':String(value);
 return `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()} IST`;
}
function dateTime(value){
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value.split('-').reverse().join('-');
 const p=parts(value);
 if(!p)return value==null||value===''?'â€”':String(value);
 return `${p.day}-${p.month}-${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()} IST`;
}
function text(value){
 if(typeof value!=='string')return value;
 // Match the entire instant before formatting date-only fragments.
 return value.replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g,stamp=>dateTime(stamp))
  .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1');
}
const api=Object.freeze({dateTime,time,text});
root.SamaraDateTime=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
