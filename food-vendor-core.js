(function(root){
'use strict';
const statementLogo='https://app.samaraassistedliving.com/assets/samara-logo.png?v=20260814-final';
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
 values=values.map(v=>label(clean(v)));const text=body.replace(/\{\{(\d+)\}\}/g,(_,i)=>values[Number(i)-1]);
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
function orderProgress(order,events){
 const receipts=(events||[]).filter(e=>e.order_id===order.id&&e.kind==='receive');
 const items=order.data?.items||[],sum=k=>items.reduce((n,it)=>n+Number(it[k]||0),0);
 const ordered=sum('residents')+sum('employees');
 const received=receipts.reduce((n,e)=>n+(e.data?.items||[]).reduce((a,it)=>a+Number(it.residents||0)+Number(it.employees||0),0),0);
 const complete=receipts.length>0&&items.every((it,i)=>['residents','employees'].every(k=>receipts.reduce((n,e)=>n+Number(e.data?.items?.[i]?.[k]||0),0)>=Number(it[k]||0)));
 const status=order.status==='Cancellation pending'?'Cancellation pending':order.status==='Closed'?(order.data?.cancelled?'Cancelled':'Closed'):complete?'Received':receipts.length?'Partially received':order.status==='Draft'?'Draft':'Pending receipt';
 return {ordered,received:receipts.length?received:null,status};
}
function orderFilterFacts(order,events){
 const receipts=(events||[]).filter(e=>e.order_id===order.id&&e.kind==='receive');
 const progress=orderProgress(order,events);
 const rejected=receipts.reduce((n,e)=>n+(e.data?.items||[]).reduce((a,it)=>a+Number(it.rejected||0),0),0);
 const shortage=receipts.length?(order.data?.items||[]).reduce((n,it,i)=>n+['residents','employees'].reduce((a,k)=>a+Math.max(0,Number(it[k]||0)-receipts.reduce((b,e)=>b+Number(e.data?.items?.[i]?.[k]||0),0)),0),0):0;
 return {...progress,rejected,shortage,hasReceipts:receipts.length>0};
}
function matchesOrderFilter(order,events,filter){
 const f=orderFilterFacts(order,events);
 switch(filter){
  case 'Ordered':return order.status!=='Draft'&&f.ordered>0;
  case 'Received':return f.hasReceipts&&f.shortage===0;
  case 'Partially received':return Number(f.received)>0&&f.shortage>0;
  case 'Rejected':return f.rejected>0;
  case 'Shortage':return f.shortage>0;
  case 'Draft':return order.status==='Draft';
  case 'Cancellation pending':return order.status==='Cancellation pending';
  case 'Cancelled':return order.status==='Closed'&&!!order.data?.cancelled;
  case 'Closed':return order.status==='Closed';
  default:return true;
 }
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
function mealSummary(report){
 const groups=['Tiffin','Lunch','Dinner','Tea/Coffee'].map(meal=>({meal,quantity:0,amount:0,missing:false,prices:new Set()}));
 for(const row of compactRows(report)){const category=/Tea|Coffee/.test(row[1])?'Coffee/Tea':row[1],g=groups.find(g=>g.meal===(category==='Coffee/Tea'?'Tea/Coffee':category));if(!g)continue;g.quantity+=row[4];
 const rates=(report.rates||[]).filter(r=>r.item===category&&r.effective<=row[0]).sort((a,b)=>b.effective.localeCompare(a.effective)||String(b.created_at||'').localeCompare(String(a.created_at||'')));
 const price=rates[0]?.price;if(row[4]>0){if(price==null){g.missing=true}else{g.prices.add(Number(price));g.amount+=row[4]*Number(price)}}
 }
 const rows=groups.map(g=>[g.meal,g.quantity,g.prices.size===1&&!g.missing?[...g.prices][0]:g.prices.size>1&&!g.missing?'Varies':null,g.missing?null:Math.round(g.amount*100)/100]);
 return [...rows,['Grand total',rows.reduce((n,r)=>n+r[1],0),null,rows.some(r=>r[3]==null)?null:Math.round(rows.reduce((n,r)=>n+r[3],0)*100)/100]];
}
const dateText=v=>typeof v==='string'?v.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,'$3-$2-$1').replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,(_,d,m,y)=>d.padStart(2,'0')+'-'+m.padStart(2,'0')+'-'+y):v;
const label=v=>typeof v==='string'?dateText(v.replace(/\bTiffin\b/gi,'Breakfast')):v;
function amountWords(value){
 if(value==null)return 'Amount pending: rates are not fixed.';
 const ones=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
 const words=n=>n<20?ones[n]:n<100?tens[Math.floor(n/10)]+(n%10?' '+ones[n%10]:''):n<1000?ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+words(n%100):''):n<100000?words(Math.floor(n/1000))+' Thousand'+(n%1000?' '+words(n%1000):''):n<10000000?words(Math.floor(n/100000))+' Lakh'+(n%100000?' '+words(n%100000):''):words(Math.floor(n/10000000))+' Crore'+(n%10000000?' '+words(n%10000000):'');
 const paise=Math.round(Math.abs(Number(value))*100),rupees=Math.floor(paise/100);
 return (value<0?'Minus ':'')+'Rupees '+words(rupees)+(paise%100?' and '+words(paise%100)+' Paise':'')+' Only';
}
function pdfFromJpegs(pages){
 const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;
 const add=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);length+=b.length};
 const object=(id,head,data)=>{offsets[id]=length;add(id+' 0 obj\n'+head);if(data){add('\nstream\n');add(data);add('\nendstream')}add('\nendobj\n')};
 add('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Count '+pages.length+' /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 pages.forEach((p,i)=>{const id=3+i*3,content=enc.encode('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q');object(id,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>');object(id+1,'<< /Type /XObject /Subtype /Image /Width '+p.width+' /Height '+p.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+p.bytes.length+' >>',p.bytes);object(id+2,'<< /Length '+content.length+' >>',content)});
 const start=length;add('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');for(let i=1;i<offsets.length;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF');return new Blob(parts,{type:'application/pdf'});
}
function statementPdf(model){
 const pages=[],W=794,H=1123,M=45,scale=2;let canvas,ctx,y,page=0;
 const font=(size,bold=false)=>{ctx.font=(bold?'bold ':'')+size+'px Arial';ctx.fillStyle='#222'};
 const wrap=(text,width,size=11,bold=false)=>{font(size,bold);const lines=[];let line='';for(const word of String(label(text)??'—').split(/\s+/)){if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line=word}else line+=(line?' ':'')+word}lines.push(line);return lines};
 const text=(value,x,top,size=11,bold=false)=>{font(size,bold);ctx.fillText(String(label(value)),x,top)};
 const finish=()=>{if(!canvas)return;text('Page '+page,M,H-25,10);const raw=atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]);pages.push({width:canvas.width,height:canvas.height,bytes:Uint8Array.from(raw,c=>c.charCodeAt(0))})};
 const newPage=()=>{finish();page++;canvas=document.createElement('canvas');canvas.width=W*scale;canvas.height=H*scale;ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);if(model.logoImage)ctx.drawImage(model.logoImage,M,24,180,180*(model.logoImage.naturalHeight||model.logoImage.height)/(model.logoImage.naturalWidth||model.logoImage.width));text('Food Vendor Statement',M,164,14,true);const vendorLines=wrap(model.vendor,W-2*M,18,true);vendorLines.forEach((v,i)=>text(v,M,193+i*22,18,true));y=210+vendorLines.length*22;text(model.period,M,y,11);y+=22};
 const drawRow=(row,widths,header=false,bold=false)=>{const lines=row.map((v,i)=>wrap(v,widths[i]-10,11,header||bold));const height=Math.max(...lines.map(v=>v.length))*15+12;let x=M;row.forEach((_,i)=>{ctx.fillStyle=header?'#eee':'#fff';ctx.fillRect(x,y,widths[i],height);ctx.strokeStyle='#999';ctx.lineWidth=.6;ctx.strokeRect(x,y,widths[i],height);lines[i].forEach((l,j)=>text(l,x+5,y+17+j*15,11,header||bold));x+=widths[i]});y+=height};
 const table=(heads,rows,widths,groupDates=false)=>{const header=()=>drawRow(heads,widths,true);if(y>H-180)newPage();header();let previousDate=null;rows.forEach((row,i)=>{const height=Math.max(...row.map((v,j)=>wrap(v,widths[j]-10).length))*15+12;if(y+height>H-50){newPage();header();previousDate=null}const shown=row.slice();if(groupDates&&row[0]===previousDate)shown[0]='';previousDate=row[0];drawRow(shown,widths,false,row[0]==='Grand total'||row[0]==='Total')})};
 newPage();table(model.heads,model.rows,model.heads.length===9?[88,112,72,72,72,72,72,72,72]:[100,160,111,111,111,111],true);
 if(y>H-300)newPage();y+=24;text('Meal summary - ordered portions',M,y,12,true);y+=12;table(model.summaryHeads,model.summary,model.summaryHeads.length===4?[140,80,110,150]:[230,130]);
 for(const note of model.notes||[]){const lines=wrap(note,W-2*M,11);if(y+lines.length*15+20>H-50)newPage();y+=20;lines.forEach(l=>{text(l,M,y,11);y+=15})}finish();return pdfFromJpegs(pages);
}

const api={dateText,orderProgress,orderFilterFacts,matchesOrderFilter,logo,statementLogo,slots,ref,message,payload,manual,balance,workbook,quantityRows,compactRows,mealSummary,label,amountWords,pdfFromJpegs,statementPdf};root.SamaraFoodCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
