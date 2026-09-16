(function(root){
'use strict';
const logo='https://samaraassistedliving.com/assets/samara-logo.png';
const slots=['Tiffin','Morning Tea / Coffee','Lunch','Evening Tea / Coffee','Dinner'];
const clean=v=>String(v??'').replace(/\s+/g,' ').trim()||'None';
const ref=id=>'FOOD-'+String(id).slice(0,8).toUpperCase();
function summary(items,key){return (items||[]).map(i=>`${clean(i.name)}: ${Number(i[key]||0)}`).join('; ')||'None'}
function total(items){return (items||[]).map(i=>`${clean(i.name)}: ${Number(i.residents||0)+Number(i.employees||0)}`).join('; ')||'None'}
function message(kind,s){
 const common=[clean(s.vendor_name),ref(s.id),clean(s.date)+' / '+clean(s.slot),clean(s.delivery)];
 let values,body;
 if(kind==='order'){
 values=[...common,summary(s.items,'residents'),summary(s.items,'employees'),total(s.items),clean(s.instructions)];
 body=`Dear {{1}},\nPlease arrange the following food order for Samara Assisted Living.\n\nOrder: {{2}}\nDate and meal: {{3}}\nDelivery time: {{4}}\nResident quantities: {{5}}\nEmployee quantities: {{6}}\nTotal quantities: {{7}}\nOther requests / instructions: {{8}}\n\nPlease acknowledge this order.\nThank you, Samara Assisted Living.`;
 }else if(kind==='modification'){
 common[1]+=' / Revision '+s.version;
 const before=total(s.before?.items);values=[...common,`Previous quantities: ${before}. Revised: ${total(s.items)}. Previous delivery: ${clean(s.before?.delivery)}.`,summary(s.items,'residents'),summary(s.items,'employees'),total(s.items),clean(s.reason)+'; '+clean(s.instructions)];
 body=`Dear {{1}},\nPlease use this revised food order for Samara Assisted Living in place of the earlier version.\n\nOrder and revision: {{2}}\nDate and meal: {{3}}\nDelivery time: {{4}}\nChanges: {{5}}\nRevised resident quantities: {{6}}\nRevised employee quantities: {{7}}\nRevised total quantities: {{8}}\nReason / instructions: {{9}}\n\nPlease acknowledge the revised quantities.\nThank you, Samara Assisted Living.`;
 }else if(kind==='receipt'){
 common[1]+=' / Receipt '+String(s.receipt_id).slice(0,8);common[3]=new Date(s.receipt.received_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
 const lines=s.receipt.items.map((i,n)=>({...i,name:s.items[n].name}));
 values=[...common,total(s.items),'Residents: '+summary(lines,'residents')+'; Employees: '+summary(lines,'employees'),summary(lines,'rejected'),String(s.outstanding)+' portions',clean(s.receipt.remarks)];
 body=`Dear {{1}},\nSamara Assisted Living has recorded a food delivery against your order.\n\nOrder and receipt: {{2}}\nDate and meal: {{3}}\nReceived at: {{4}}\nOrdered quantities: {{5}}\nAccepted this delivery: {{6}}\nRejected this delivery: {{7}}\nOutstanding quantities: {{8}}\nRemarks / instructions: {{9}}\n\nPlease review any discrepancy and acknowledge.\nThank you, Samara Assisted Living.`;
 }else throw Error('Unknown food message type');
 values=values.map(clean);const text=body.replace(/\{\{(\d+)\}\}/g,(_,i)=>values[Number(i)-1]);
 return {name:'samara_food_'+kind,values,text,logo,tooLong:text.length>3500};
}
function payload(kind,s){const m=message(kind,s);if(!/^[1-9][0-9]{7,14}$/.test(s.phone))throw Error('Invalid vendor phone');if(m.tooLong)throw Error('Message exceeds 3500 characters; use manual WhatsApp or shorten instructions before finalising');return {messaging_product:'whatsapp',to:s.phone,type:'template',template:{name:m.name,language:{code:'en'},components:[{type:'header',parameters:[{type:'image',image:{link:logo}}]},{type:'body',parameters:m.values.map(text=>({type:'text',text}))}]}}}
function manual(kind,s){return 'https://wa.me/'+s.phone+'?text='+encodeURIComponent(message(kind,s).text+'\n\nSamara Assisted Living: https://samaraassistedliving.com/')}
function balance(report){const entries=report.entries||[];return {opening:Number(report.opening||0),closing:Number(report.opening||0)+entries.reduce((n,e)=>n+Number(e.amount||0),0),unpriced:Number(report.unpriced_before||0)+entries.filter(e=>e.amount===null).length}}
function workbook(sheets){
 const enc=new TextEncoder(),xml=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
 const files={};
 files['[Content_Types].xml']='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
 files['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 files['xl/workbook.xml']='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
 files['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>';
 sheets.forEach((s,i)=>{files['xl/worksheets/sheet'+(i+1)+'.xml']='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="12" width="22" customWidth="1"/></cols><sheetData>'+s.rows.map((r,j)=>'<row r="'+(j+1)+'">'+r.map(v=>typeof v==='number'&&Number.isFinite(v)?'<c><v>'+v+'</v></c>':'<c t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>'});
 const parts=[],central=[];let offset=0;
 const header=n=>new Uint8Array(n),put=(a,p,v,n=4)=>{for(let i=0;i<n;i++)a[p+i]=(v>>>(i*8))&255};
 for(const [path,text]of Object.entries(files)){const name=enc.encode(path),data=enc.encode(text);let crc=0xffffffff;for(const b of data){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}crc=(crc^0xffffffff)>>>0;
 const l=header(30);put(l,0,0x04034b50);put(l,4,20,2);put(l,14,crc);put(l,18,data.length);put(l,22,data.length);put(l,26,name.length,2);parts.push(l,name,data);
 const c=header(46);put(c,0,0x02014b50);put(c,4,20,2);put(c,6,20,2);put(c,16,crc);put(c,20,data.length);put(c,24,data.length);put(c,28,name.length,2);put(c,42,offset);central.push(c,name);offset+=30+name.length+data.length;}
 const size=central.reduce((n,a)=>n+a.length,0),end=header(22);put(end,0,0x06054b50);put(end,8,Object.keys(files).length,2);put(end,10,Object.keys(files).length,2);put(end,12,size);put(end,16,offset);return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function quantityRows(report){
 return (report.orders||[]).filter(o=>o.data.vendor_id===report.vendor_id&&o.data.date>=report.from&&o.data.date<=report.to).sort((a,b)=>a.data.date.localeCompare(b.data.date)||slots.indexOf(a.data.slot)-slots.indexOf(b.data.slot)).flatMap(o=>{
 const receipts=(report.events||[]).filter(e=>e.order_id===o.id&&e.kind==='receive');
 return (o.data.items||[]).map((it,i)=>{const sum=k=>receipts.reduce((n,e)=>n+Number(e.data.items?.[i]?.[k]||0),0);
 return [o.data.date,o.data.slot,ref(o.id),it.name,Number(it.residents||0),Number(it.employees||0),Number(it.residents||0)+Number(it.employees||0),receipts.length?sum('residents'):'Not recorded',receipts.length?sum('employees'):'Not recorded',receipts.length?sum('residents')+sum('employees'):'Not recorded',receipts.length?sum('rejected'):'Not recorded',o.status,o.data.instructions||''];});
 });
}
function compactRows(report){
 const groups=new Map();
 for(const o of report.orders||[]){const d=o.data||{},receipts=(report.events||[]).filter(e=>e.order_id===o.id&&e.kind==='receive');
 if(d.vendor_id!==report.vendor_id||d.date<report.from||d.date>report.to||o.status==='Draft'||(o.status==='Closed'&&!receipts.length))continue;
 const key=d.date+'|'+d.slot,g=groups.get(key)||{date:d.date,meal:d.slot,res:0,emp:0,received:0,hasReceipt:false,entries:[]};
 for(const it of d.items||[]){g.res+=Number(it.residents||0);g.emp+=Number(it.employees||0)}
 for(const e of receipts){g.hasReceipt=true;for(const it of e.data.items||[])g.received+=Number(it.residents||0)+Number(it.employees||0)}
 g.entries.push(...(report.entries||[]).filter(e=>e.kind==='Receipt'&&e.data.order_id===o.id));groups.set(key,g);
 }
 return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)||slots.indexOf(a.meal)-slots.indexOf(b.meal)).map(g=>{
 const priced=g.entries.length&&g.entries.every(e=>e.amount!=null&&e.data.unit_price!=null),rates=[...new Set(g.entries.map(e=>Number(e.data.unit_price)))];
 return [g.date,g.meal,g.res,g.emp,g.res+g.emp,g.hasReceipt?g.received:null,priced?(rates.length===1?rates[0]:'Mixed'):null,g.entries.length?g.entries.reduce((n,e)=>n+Number(e.data.quantity||0),0):null,priced?Math.round(g.entries.reduce((n,e)=>n+Number(e.amount),0)*100)/100:null];
 });
}
const api={logo,slots,ref,message,payload,manual,balance,workbook,quantityRows,compactRows};root.SamaraFoodCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
