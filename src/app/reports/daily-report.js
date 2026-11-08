  // 2.19.89: a table never starts where it cannot fit (no overlap with the footer); empty Session columns hidden.
  // 2.19.88: contents boxes link to their slide; Home / Back on every slide; abnormal readings in red bold.
  // 2.19.86: colourful deck (accent colour + icon per section, coloured tiles / tables, problem rows in red).
  // 2.19.85: larger fonts throughout the PowerPoint; table notes printed under each table (Care services slide).
  // 2.19.75: DAILY REPORT — "all happenings of the day" (midnight to midnight, IST) as a PowerPoint deck (Windows),
  // with an on-screen preview. Admin / Directors get every slide; the Nursing Manager gets the same report without the
  // money slides / numbers (the database removes them — SQL 349 mis_daily_report). The same report goes out as a PDF on
  // WhatsApp every morning (Edge Function mis-daily-report-dispatch). A finished day is saved the first time it is
  // prepared, so it always shows the same numbers; Admin can "Prepare again".
  const MDR_C={mag:'A80D4F',deep:'4A1430',blush:'FDF1F6',pink:'F7DCE8',line:'F0D2DF',ink:'3A2230',grey:'8B6B79',green:'13643A',red:'B4232F',amber:'8A5A00',white:'FFFFFF'};
  function mdrEnsureStyle(){
    if(document.getElementById('mdr-style'))return;
    const st=document.createElement('style');st.id='mdr-style';
    st.textContent=`
      .mdr-wrap{display:grid;gap:16px;min-width:0}
      .mdr-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
      .mdr-bar .field{margin:0;min-width:0}
      .mdr-chips{display:flex;flex-wrap:wrap;gap:6px}
      .mdr-chips button{border:1.5px solid #e9a9c4;background:#fff;color:#8a1c52;border-radius:999px;padding:7px 14px;font-weight:800;cursor:pointer;font-size:14px}
      .mdr-chips button[aria-pressed="true"]{background:linear-gradient(135deg,#a80d4f,#d6338a);color:#fff;border-color:transparent}
      .mdr-actions{display:flex;flex-wrap:wrap;gap:8px}
      .mdr-status{font-size:13.5px;color:#7a5a68;line-height:1.5}
      .mdr-status b{color:#4a1430}
      .mdr-sec{border:1.5px solid #f0d2df;border-radius:16px;background:#fff;padding:14px 16px;min-width:0}
      .mdr-sec h3{margin:0;color:#a80d4f;font-size:19px}
      .mdr-sec>small{display:block;color:#8b6b79;margin:2px 0 10px}
      .mdr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px}
      .mdr-kpi{background:linear-gradient(145deg,#fffafd,#fdf1f6);border:1px solid #e8c3d2;border-radius:14px;padding:10px 12px;min-width:0}
      .mdr-kpi small{display:block;color:#8b6b79;font-weight:700;font-size:14px}
      .mdr-kpi strong{display:block;font-size:28px;color:#4a1430;margin-top:2px;overflow-wrap:anywhere}
      .mdr-kpi em{display:block;font-style:normal;font-size:12px;margin-top:3px;color:#8b6b79}
      .mdr-kpi em.good{color:#13643a}.mdr-kpi em.bad{color:#b4232f}
      .mdr-tables{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:12px}
      .mdr-table{min-width:0}
      .mdr-table b{display:block;color:#4a1430;margin-bottom:4px}
      .mdr-table table{width:100%;border-collapse:collapse;table-layout:auto;font-size:15px}
      .mdr-table th{background:#a80d4f;color:#fff;text-align:left;padding:6px 8px;font-size:14px}
      .mdr-table td{padding:6px 8px;border-bottom:1px solid #f7e6ee;vertical-align:top;overflow-wrap:anywhere;color:#3a2230}
      .mdr-table td.num,.mdr-table th.num{text-align:right;white-space:nowrap}
      .mdr-table td.mdr-short{white-space:nowrap}
      .mdr-table .mdr-empty{color:#9a8590;font-style:italic}
      .mdr-table .mdr-more{font-size:13px;color:#8b6b79;margin-top:4px}
      .mdr-sends table{width:100%;border-collapse:collapse;font-size:13px}
      .mdr-sends td,.mdr-sends th{padding:5px 8px;border-bottom:1px solid #f7e6ee;text-align:left}
    `;
    document.head.appendChild(st);
  }
  const mdrIsMoneyCol=c=>String(c||'').trim()==='₹';
  const mdrMoney=v=>v==null||v===''?'—':'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:0});
  const mdrNum=v=>{if(v==null||v==='')return '—';const n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-IN',{maximumFractionDigits:1}):String(v)};
  const mdrKpiValue=k=>k?.value==null?'—':k.unit==='₹'?mdrMoney(k.value):k.unit==='%'?`${mdrNum(k.value)}%`:k.unit==='min'?`${mdrNum(k.value)} min`:mdrNum(k.value);
  const mdrCell=(col,v)=>mdrIsMoneyCol(col)?mdrMoney(v):(v==null||v===''?'—':typeof v==='number'?mdrNum(v):String(v));
  // 2.19.88: which part of a vitals text ("BP 160/90 · Pulse 86 · SpO2 97% · Temp 98.2") is outside normal
  function mdrVitalAbnormal(part){
    const t=String(part||'').trim(),n=parseFloat((t.match(/[\s:=]\s*(-?\d+(?:\.\d+)?)/)||[])[1]); // the value after the name (SpO2's own "2" is not the value)
    const bp=t.match(/^BP\s*(\d+)\s*\/\s*(\d+)/i);
    if(bp){const sy=+bp[1],di=+bp[2];return sy>=140||sy<90||di>=90||di<60}
    if(!Number.isFinite(n))return false;
    if(/^(pulse|pr|hr|heart)/i.test(t))return n>100||n<60;
    if(/^spo2|^sat/i.test(t))return n<95;
    if(/^temp/i.test(t))return n<45?(n>=37.5||n<35.8):(n>=99.5||n<96.5);
    if(/^(rr|resp)/i.test(t))return n>24||n<12;
    if(/^(rbs|grbs|cbg|sugar|glucose|fbs|ppbs)/i.test(t))return n>200||n<70;
    return false;
  }
  // "Yesterday 4 · 7-day avg 4.0" with good / bad colour
  function mdrCompare(k){
    if(k?.prev==null&&k?.avg7==null)return {text:k?.note||'',tone:''};
    const f=v=>k.unit==='₹'?mdrMoney(v):k.unit==='%'?`${mdrNum(v)}%`:mdrNum(v);
    const diff=Number(k.value)-Number(k.prev);
    const arrow=k.value==null||k.prev==null||!diff?'':diff>0?'▲ ':'▼ ';
    const tone=!arrow||!k.good?'':((diff>0)===(k.good==='up')?'good':'bad');
    return {text:`${arrow}Yesterday ${f(k.prev)} · 7-day avg ${f(k.avg7)}`,tone};
  }

  // ───────────── PowerPoint ─────────────
  let mdrPptxPromise=null;
  function loadPptxLibrary(){
    if(window.PptxGenJS)return Promise.resolve(window.PptxGenJS);
    const add=src=>new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=src;sc.async=true;sc.onload=res;sc.onerror=()=>rej(new Error('PowerPoint maker could not be loaded — check the internet connection.'));document.head.appendChild(sc)});
    if(!mdrPptxPromise)mdrPptxPromise=add(`./vendor/pptxgen.bundle.js?v=${APP_VERSION}`)
      .catch(()=>add('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'))
      .then(()=>{if(!window.PptxGenJS)throw new Error('PowerPoint maker did not load.');return window.PptxGenJS})
      .catch(e=>{mdrPptxPromise=null;throw e});
    return mdrPptxPromise;
  }
  async function mdrLogoData(){
    try{
      const res=await fetch('./assets/samara-logo.png',{cache:'force-cache'});if(!res.ok)return null;
      const blob=await res.blob();
      const data=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=no;fr.readAsDataURL(blob)});
      // shrink the 1536 px logo to 420 px so it adds ~40 KB per deck, not 500 KB per slide
      const im=await new Promise((ok,no)=>{const x=new Image();x.onload=()=>ok(x);x.onerror=no;x.src=data});
      const w=Math.min(420,im.naturalWidth||420),hh=Math.round(w*(im.naturalHeight||280)/(im.naturalWidth||420));
      const cv=document.createElement('canvas');cv.width=w;cv.height=hh;cv.getContext('2d').drawImage(im,0,0,w,hh);
      return {data:cv.toDataURL('image/png').replace(/^data:/,''),w,h:hh};
    }catch{return null}
  }
  async function buildDailyReportPptx(rep){
    const PptxGenJS=await loadPptxLibrary();
    const logo=await mdrLogoData();
    // 2.19.88: two passes — the first only finds the slide where each section starts (a section can run over several
    // slides), so the contents boxes on the title slide can link to the right slide.
    const secStart=[];
    mdrRenderDeck(new PptxGenJS(),rep,logo,secStart);
    const pptx=new PptxGenJS();
    mdrRenderDeck(pptx,rep,logo,secStart);
    const care=rep.variant==='care';
    const name=`Samara_Daily_Report_${String(rep.day||'').slice(0,10)}${care?'_Nursing':''}.pptx`;
    await pptx.writeFile({fileName:name,compression:true});
    return name;
  }
  function mdrRenderDeck(pptx,rep,logo,secStart){
    pptx.layout='LAYOUT_WIDE'; // 13.33 × 7.5 in
    pptx.author='Samara Care ERP';pptx.company='Samara Health Care LLP';
    pptx.title=`Samara Daily Report ${rep.day_label}`;
    const W=13.333,H=7.5,M=0.5,CW=W-2*M,BOTTOM=6.9,FONT='Calibri';
    const care=rep.variant==='care';
    const copy=care?'Nursing copy (without money)':'Directors’ copy';
    // 2.19.86: colourful deck — each section has its own accent colour (c = main, d = dark text, t = tile tint, z = zebra row)
    const PAL=[{c:'A80D4F',d:'7A0A3A',t:'FCE4EE',z:'FFF5F9'},{c:'0F766E',d:'0B524D',t:'DDF3EF',z:'F3FBF9'},{c:'6D28D9',d:'4C1D95',t:'EDE7FB',z:'F8F5FE'},
               {c:'C2410C',d:'8A2E08',t:'FDEBDD',z:'FFF8F2'},{c:'1D4ED8',d:'1E3A8A',t:'E2EAFB',z:'F5F8FE'},{c:'15803D',d:'14532D',t:'E0F2E6',z:'F4FBF6'}];
    const ICON={glance:'📊',movement:'🛏️',clinical:'🩺',escalations:'🚨',services:'💉',attention:'⚠️',billing:'🧾',money:'💰',staff:'👩‍⚕️',stores:'📦',family:'👪',exceptions:'🔍'};
    let accIdx=0,acc=PAL[0],icon='';
    let pageNo=0;
    const footer=s=>{
      pageNo+=1;
      s.addText(`Samara Health Care LLP  ·  Daily Report ${rep.day_label} (${rep.weekday||''})`,{x:M,y:7.06,w:7,h:0.3,fontSize:11,color:MDR_C.grey,fontFace:FONT});
      s.addText(copy,{x:W/2-1.8,y:7.06,w:3.6,h:0.3,fontSize:11,color:MDR_C.grey,align:'center',fontFace:FONT});
      s.addText(String(pageNo),{x:W-M-0.6,y:7.06,w:0.6,h:0.3,fontSize:11,color:MDR_C.grey,align:'right',fontFace:FONT});
      // Home (contents) and Back (previous slide) — work in Slide Show (click) and in editing (Ctrl + click)
      navBtn(s,'⌂  Home',W-M-2.9,1,'Contents');
      if(pageNo>2)navBtn(s,'◀  Back',W-M-1.75,pageNo-1,'Previous slide');
    };
    const mdrLinkArea=(s,x,y,w,h,slide,tip)=>s.addText('',{x,y,w,h,hyperlink:{slide,tooltip:tip},margin:0});
    const navBtn=(s,label,x,slide,tip)=>{
      s.addText(label,{x,y:7.07,w:1.05,h:0.3,shape:pptx.ShapeType.roundRect,rectRadius:0.15,fill:{color:acc.t},line:{color:acc.c,width:0.75},
        color:acc.d,fontSize:11,bold:true,align:'center',valign:'middle',fontFace:FONT,margin:0});
      mdrLinkArea(s,x,7.07,1.05,0.3,slide,tip);
    };
    // slide master: the top bar, logo and footer line are stored once for the whole deck
    pptx.defineSlideMaster({title:'MDR',background:{color:'FFFFFF'},objects:[
      {rect:{x:0,y:0,w:W,h:0.12,fill:{color:MDR_C.mag},line:{color:MDR_C.mag}}},
      {line:{x:M,y:7.02,w:CW,h:0,line:{color:MDR_C.line,width:0.75}}},
      ...(logo?[{image:{data:logo.data,x:W-M-Math.min(1.4,0.42*logo.w/logo.h),y:0.68,w:Math.min(1.4,0.42*logo.w/logo.h),h:0.42}}]:[])]});
    const addPage=()=>pptx.addSlide({masterName:'MDR'});
    const header=(s,title,subtitle,n)=>{
      s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:W,h:0.14,fill:{color:acc.c},line:{color:acc.c}});
      s.addShape(pptx.ShapeType.ellipse,{x:M,y:0.3,w:0.78,h:0.78,fill:{color:acc.c},line:{color:acc.t,width:3}});
      if(icon)s.addText(icon,{x:M,y:0.3,w:0.78,h:0.78,fontSize:24,align:'center',valign:'middle',fontFace:'Segoe UI Emoji',margin:0});
      s.addText(title,{x:M+0.95,y:0.26,w:8.6,h:0.58,fontSize:30,bold:true,color:acc.d,fontFace:FONT,margin:0});
      if(subtitle)s.addText(subtitle,{x:M+0.95,y:0.84,w:9.4,h:0.32,fontSize:14.5,fit:'shrink',color:MDR_C.grey,fontFace:FONT,margin:0});
      if(n){s.addShape(pptx.ShapeType.roundRect,{x:W-M-2.75,y:0.3,w:1.2,h:0.36,fill:{color:acc.t},line:{color:acc.t},rectRadius:0.18});
        s.addText(n,{x:W-M-2.75,y:0.3,w:1.2,h:0.36,fontSize:13,bold:true,color:acc.d,align:'center',valign:'middle',fontFace:FONT,margin:0});}
    };
    // KPI tiles; returns the y below them
    const tiles=(s,kpis,y,perRowMax=5)=>{
      if(!kpis.length)return y;
      if(kpis.length>10)perRowMax=7; // e.g. Care services (13 numbers) stays in 2 rows
      const per=kpis.length<=perRowMax?kpis.length:Math.min(perRowMax,Math.ceil(kpis.length/2));
      const gap=0.14,tw=(CW-gap*(per-1))/per,th=1.42,small=tw<2.1,ix=0.2;
      kpis.forEach((k,i)=>{
        const r=Math.floor(i/per),c=i%per,x=M+c*(tw+gap),yy=y+r*(th+gap),ta=PAL[(accIdx+i)%PAL.length];
        const cmp=mdrCompare(k);
        s.addShape(pptx.ShapeType.roundRect,{x,y:yy,w:tw,h:th,fill:{color:ta.t},line:{color:ta.c,width:1},rectRadius:0.08});
        s.addShape(pptx.ShapeType.rect,{x:x+0.03,y:yy+0.14,w:0.08,h:th-0.28,fill:{color:ta.c},line:{color:ta.c}});
        // label may wrap to 2 lines; long labels / narrow tiles get a smaller font so they never run into the number
        const lw=tw-ix-0.1,lfs=small?(String(k.label||'').length*11*0.0078>2*lw?10:11.5):(String(k.label||'').length*13*0.0078>2*lw?11.5:13.5);
        s.addText(k.label,{x:x+ix,y:yy+0.07,w:lw,h:0.46,fontSize:lfs,bold:true,color:ta.d,fontFace:FONT,margin:0,valign:'top'});
        s.addText(mdrKpiValue(k),{x:x+ix,y:yy+0.52,w:lw,h:0.56,fontSize:small?(k.unit==='₹'?22:28):(k.unit==='₹'?28:32),bold:true,color:ta.d,fontFace:FONT,margin:0,fit:'shrink'});
        if(cmp.text)s.addText(small?cmp.text.replace('Yesterday','Yday').replace('7-day avg','avg'):cmp.text,{x:x+ix,y:yy+1.08,w:lw,h:0.3,fontSize:small?9.5:11.5,bold:!!cmp.tone,color:cmp.tone==='good'?MDR_C.green:cmp.tone==='bad'?MDR_C.red:'6B5560',fontFace:FONT,margin:0,fit:'shrink',valign:'top'});
      });
      return y+Math.ceil(kpis.length/per)*(th+gap)+0.04;
    };
    // table geometry: column widths by content, row heights by wrapping
    const tableModel=(t0,w,fs=13)=>{
      // a "Session N" column that is empty for every row is left out (e.g. Session 3 when all plans are twice daily)
      const keep=(t0.cols||[]).map((c,i)=>!(/^Session \d/.test(String(c))&&(t0.rows||[]).length&&(t0.rows||[]).every(r=>r[i]==null||r[i]==='—')));
      const t=keep.every(Boolean)?t0:{...t0,cols:t0.cols.filter((_,i)=>keep[i]),rows:(t0.rows||[]).map(r=>r.filter((_,i)=>keep[i]))};
      const cols=t.cols||[];
      const rows=(t.rows||[]).map(r=>cols.map((c,i)=>mdrCell(c,r[i])));
      const weights=cols.map((c,i)=>Math.max(Math.ceil(String(c).length*1.25)+1,...rows.map(r=>Math.min(String(r[i]).length,60)),3));
      const sum=weights.reduce((a,b)=>a+b,0)||1;
      // no column narrower than its longest word (so "Warning" never breaks as "Warni-ng")
      const minW=cols.map((c,i)=>Math.max(0.65,0.16+Math.max(...[String(c),...rows.map(r=>r[i])].map(v=>Math.max(0,...String(v).split(/\s+/).map(x=>x.length))))*fs/125*1.12));
      let colW=weights.map((x,i)=>Math.max(minW[i],w*x/sum));
      for(let pass=0;pass<4;pass++){const over=colW.reduce((a,b)=>a+b,0)-w;if(over<=0.001)break;
        const flex=colW.map((x,i)=>Math.max(0,x-minW[i])),fs2=flex.reduce((a,b)=>a+b,0);if(!fs2)break;
        colW=colW.map((x,i)=>x-over*flex[i]/fs2);}
      const k=w/colW.reduce((a,b)=>a+b,0);colW=colW.map(x=>x*k);
      const cpi=125/fs; // characters per inch
      const rowH=r=>0.05+0.0165*fs*Math.max(1,...r.map((v,i)=>Math.ceil(String(v).length/Math.max(1,(colW[i]-0.12)*cpi))));
      const noteLines=t.note&&!t.error?Math.ceil(String(t.note).length/Math.max(1,w*(125/11))):0;
      return {t,cols,rows,colW,rowH,fs,msg:t.error||'',noteH:noteLines?0.06+0.19*noteLines:0};
    };
    const TITLE_H=0.4,HEAD_H=0.32;
    // height of rows [from, to) with title + header
    const tableHeight=(m,from=0,to=m.rows.length)=>TITLE_H+HEAD_H+(m.msg?0.34:m.rows.slice(from,to).reduce((a,r)=>a+m.rowH(r),0))+0.05+(to>=m.rows.length?m.noteH:0);
    // how many rows from `from` fit in maxH
    const rowsThatFit=(m,from,maxH)=>{let n=0,h=TITLE_H+HEAD_H+0.05;for(let i=from;i<m.rows.length;i++){h+=m.rowH(m.rows[i])+(i===m.rows.length-1?m.noteH:0);if(h>maxH)break;n+=1}return n};
    const drawTable=(s,m,x,y,w,from=0,to=m.rows.length,cont=false)=>{
      const t=m.t;
      s.addShape(pptx.ShapeType.rect,{x,y:y+0.05,w:0.09,h:0.27,fill:{color:acc.c},line:{color:acc.c}});
      s.addText(t.title+(cont?' (continued)':''),{x:x+0.17,y,w:w-0.17,h:0.36,fontSize:16,bold:true,color:acc.d,fontFace:FONT,margin:0});
      const numLike=(c,v)=>mdrIsMoneyCol(c)||/^[\d,.₹%\s-]+$/.test(v)||/^[▲▼=]( \d+)?$/.test(v);
      const head=m.cols.map((c,i)=>({text:c,options:{bold:true,color:MDR_C.white,fill:{color:acc.c},align:mdrIsMoneyCol(c)||m.rows.every(r=>numLike(c,r[i]))&&m.rows.length?'right':'left'}}));
      const body=m.msg?[[{text:m.msg,options:{colspan:m.cols.length,italic:true,color:MDR_C.grey}}]]
        :m.rows.slice(from,to).map((r,ri)=>{
          const warn=r.some(v=>String(v).startsWith('⚠')); // a problem row stands out in light red
          return r.map((v,i)=>{const sv=String(v),col=String(m.cols[i]);
            const level=/^(level|alert)$/i.test(col)?(/critical/i.test(sv)?MDR_C.red:/warn/i.test(sv)?'B45309':''):'';
            const color=level||(sv.startsWith('⚠')?MDR_C.red:sv.startsWith('▲')?'1D4ED8':sv.startsWith('▼')?'C2410C':warn?'7A1F1F':MDR_C.ink);
            const opts={align:numLike(col,sv)?'right':'left',bold:!!level||/^[⚠▲▼]/.test(sv),color,fill:{color:warn?'FDECEC':ri%2?acc.z:'FFFFFF'}};
            // vitals text: each reading outside normal in red bold
            if(/^reading/i.test(col)&&sv.includes('·')){
              const parts=sv.split(' · ');
              return {text:parts.map((p,pi)=>({text:p+(pi<parts.length-1?' · ':''),options:mdrVitalAbnormal(p)?{color:MDR_C.red,bold:true}:{color}})),options:opts};
            }
            return {text:v,options:opts}});
        });
      s.addTable([head,...body],{x,y:y+TITLE_H,w,colW:m.colW,fontSize:m.fs,fontFace:FONT,color:MDR_C.ink,border:{type:'solid',pt:0.5,color:acc.t},margin:[0.03,0.07,0.03,0.07],autoPage:false});
      let h=tableHeight(m,from,to)-(to>=m.rows.length?m.noteH:0);
      if(m.noteH&&to>=m.rows.length){s.addText(String(t.note),{x,y:y+h,w,h:m.noteH,fontSize:11,italic:true,color:MDR_C.grey,fontFace:FONT,margin:0,valign:'top'});h+=m.noteH}
      const more=(Number(t.total)||0)-m.rows.length;
      if(!m.msg&&to>=m.rows.length&&more>0){s.addText(`+ ${more} more — see the ERP`,{x,y:y+h-0.03,w,h:0.26,fontSize:11,italic:true,color:MDR_C.grey,fontFace:FONT,margin:0});h+=0.26}
      return h;
    };

    // 1. title slide
    {
      const s=pptx.addSlide();s.background={color:MDR_C.blush};
      s.addShape(pptx.ShapeType.rect,{x:0,y:0,w:W,h:0.22,fill:{color:MDR_C.mag},line:{color:MDR_C.mag}});
      s.addShape(pptx.ShapeType.rect,{x:0,y:H-0.22,w:W,h:0.22,fill:{color:MDR_C.mag},line:{color:MDR_C.mag}});
      if(logo){const hh=1.3,ww=Math.min(3.2,hh*logo.w/logo.h);s.addImage({data:logo.data,x:M+0.2,y:0.8,w:ww,h:hh});}
      s.addText('Daily Report',{x:M+0.2,y:2.45,w:6,h:0.9,fontSize:46,bold:true,color:MDR_C.mag,fontFace:FONT,margin:0});
      s.addText(`${rep.day_label}  ·  ${rep.weekday||''}`,{x:M+0.2,y:3.35,w:6,h:0.6,fontSize:28,color:MDR_C.deep,fontFace:FONT,margin:0});
      s.addText(rep.partial?`Today so far — figures up to ${rep.generated_label||''}. Not the final report.`:'Midnight to midnight (IST) — all happenings of the day',{x:M+0.2,y:4.0,w:6,h:0.7,valign:'top',fontSize:15,color:rep.partial?MDR_C.red:MDR_C.grey,fontFace:FONT,margin:0});
      s.addText(`${copy}  ·  Prepared ${rep.saved_label||rep.generated_label||''}`,{x:M+0.2,y:4.85,w:6,h:0.35,fontSize:12,color:MDR_C.grey,fontFace:FONT,margin:0});
      // contents as coloured chips, two columns on the right
      const secs=rep.sections||[],rowsN=Math.ceil(secs.length/2)||1,cx0=6.75,cwid=2.95,cg=0.14,ch=Math.min(0.82,(6.55-0.75-cg*(rowsN-1))/rowsN);
      secs.forEach((x,i)=>{const pc=PAL[i%PAL.length],cx=cx0+Math.floor(i/rowsN)*(cwid+cg),cy=0.75+(i%rowsN)*(ch+cg);
        s.addShape(pptx.ShapeType.roundRect,{x:cx,y:cy,w:cwid,h:ch,fill:{color:pc.t},line:{color:pc.c,width:1},rectRadius:0.1});
        s.addShape(pptx.ShapeType.ellipse,{x:cx+0.12,y:cy+(ch-0.5)/2,w:0.5,h:0.5,fill:{color:pc.c},line:{color:pc.c}});
        s.addText(String(i+1),{x:cx+0.12,y:cy+(ch-0.5)/2,w:0.5,h:0.5,fontSize:14,bold:true,color:MDR_C.white,align:'center',valign:'middle',fontFace:FONT,margin:0});
        s.addText(`${ICON[x.key]?ICON[x.key]+'  ':''}${x.title}`,{x:cx+0.72,y:cy,w:cwid-0.8,h:ch,fontSize:13.5,bold:true,color:pc.d,valign:'middle',fontFace:FONT,margin:0,fit:'shrink'});
        // the whole box is clickable: an invisible layer on top carries the link (no underlined text)
        if(secStart[i])mdrLinkArea(s,cx,cy,cwid,ch,secStart[i],`Go to ${x.title}`);});
      s.addText('Tap a box to open that section · every slide has Home and Back',{x:cx0,y:6.62,w:2*cwid+cg,h:0.3,fontSize:11,italic:true,color:MDR_C.grey,align:'center',fontFace:FONT,margin:0});
      s.addText('Samara Health Care LLP  ·  Samara Assisted Living',{x:M+0.2,y:6.55,w:6,h:0.4,fontSize:12,color:MDR_C.grey,fontFace:FONT,margin:0});
      pageNo+=1;
    }

    const total=(rep.sections||[]).length;
    (rep.sections||[]).forEach((sec,si)=>{
      const numText=`${si+1} of ${total}`;
      accIdx=si%PAL.length;acc=PAL[accIdx];icon=ICON[sec.key]||'';
      secStart[si]=pageNo+1;
      let s=addPage();header(s,sec.title,sec.subtitle,numText);
      let y=tiles(s,sec.kpis||[],1.32);
      if(sec.key==='glance'){
        // 8-day bar charts (editable PowerPoint charts)
        const charts=(sec.kpis||[]).filter(k=>Array.isArray(k.series)&&['Guests in house','Collected'].includes(k.label));
        const cw=charts.length>1?(CW-0.3)/2:CW;
        charts.forEach((k,i)=>{
          const x=M+i*(cw+0.3),hh=Math.max(1.6,BOTTOM-y-0.45);
          // 2.19.86: each bar coloured against the day before — green = better, red = worse, grey = same (first bar: grey)
          const vals=(k.series||[]).map(v=>Number(v)||0),downGood=k.good==='down';
          const barColors=vals.map((v,ix)=>ix===0||v===vals[ix-1]?'9CA3AF':((v>vals[ix-1])!==downGood?'15803D':'B4232F'));
          s.addChart(pptx.ChartType.bar,[{name:k.label,labels:k.series_days||[],values:vals}],
            {x,y,w:cw,h:hh,barDir:'col',chartColors:barColors.length>1?barColors:[acc.c],showValue:true,dataLabelFontSize:12,dataLabelColor:MDR_C.deep,
             dataLabelFormatCode:k.unit==='₹'?'#,##0':'0',valAxisHidden:true,valGridLine:{style:'none'},catAxisLabelFontSize:12,catAxisLabelColor:MDR_C.grey,
             showTitle:true,title:`${k.label} — last 8 days`,titleFontSize:16,titleColor:MDR_C.deep,showLegend:false});
          s.addText([{text:'■ ',options:{color:'15803D'}},{text:downGood?'lower than the day before   ':'higher than the day before   '},{text:'■ ',options:{color:'B4232F'}},{text:downGood?'higher   ':'lower   '},{text:'■ ',options:{color:'9CA3AF'}},{text:'same'}],
            {x,y:y+hh+0.02,w:cw,h:0.3,fontSize:11,color:'6B5560',align:'center',fontFace:FONT,margin:0});
        });
        footer(s);return;
      }
      // empty tables are listed in one line ("Nothing recorded: …") instead of taking space
      const tables=(sec.tables||[]).filter(t=>t.error||(t.rows||[]).length);
      const empty=(sec.tables||[]).filter(t=>!t.error&&!(t.rows||[]).length).map(t=>t.title);
      let i=0;
      const newSlide=()=>{footer(s);s=addPage();header(s,`${sec.title} (continued)`,sec.subtitle,numText);y=1.32;};
      const narrow=t=>t&&(t.cols||[]).length<=4;
      while(i<tables.length){
        const a=tables[i];
        // pair two small tables side by side (the partner may be further down the list)
        const j=narrow(a)?tables.findIndex((t,x)=>x>i&&narrow(t)):-1;
        if(j>i+1)tables.splice(i+1,0,tables.splice(j,1)[0]);
        const b=j>i?tables[i+1]:null;
        if(narrow(a)&&narrow(b)){
          const w=(CW-0.3)/2,ma=tableModel(a,w,12),mb=tableModel(b,w,12);
          const need=Math.max(tableHeight(ma),tableHeight(mb));
          // side by side when both fit here, or on a fresh slide if little room is left here; otherwise one below the other
          if(y+need<=BOTTOM||(BOTTOM-y<1.6&&need<=BOTTOM-1.3)){
            if(y+need>BOTTOM)newSlide();
            drawTable(s,ma,M,y,w);drawTable(s,mb,M+w+0.3,y,w);
            y+=need+0.15;i+=2;continue;
          }
        }
        const m=tableModel(a,CW,(a.cols||[]).length>7?12:13);
        let from=0,cont=false;
        // 2.19.89: never start a table where not even its title, header and first row (or its message) fit — new slide instead
        const firstNeed=m.msg?tableHeight(m):TITLE_H+HEAD_H+0.05+(m.rows.length?m.rowH(m.rows[0]):0.34)+(m.rows.length===1?m.noteH:0);
        if(y+firstNeed>BOTTOM&&y>1.35)newSlide();
        do{
          let n=rowsThatFit(m,from,BOTTOM-y);
          if((m.msg?y+tableHeight(m)>BOTTOM:n<Math.min(3,m.rows.length-from))&&y>1.35){newSlide();n=rowsThatFit(m,from,BOTTOM-y)}
          n=Math.max(1,n);
          y+=drawTable(s,m,M,y,CW,from,Math.min(m.rows.length,from+n),cont)+0.15;
          from+=n;cont=true;
          if(from<m.rows.length)newSlide();
        }while(from<m.rows.length);
        i+=1;
      }
      if(empty.length){
        if(y+0.42>BOTTOM)newSlide();
        s.addText(`Nothing recorded: ${empty.join(' · ')}`,{x:M,y,w:CW,h:0.38,fontSize:14,italic:true,color:MDR_C.grey,fontFace:FONT,margin:0});
      }
      footer(s);
    });
  }

  // ───────────── page ─────────────
  function DailyReport({profile,onNavigate}){
    React.useEffect(()=>{mdrEnsureStyle()},[]);
    const isAdmin=profile?.role==='Admin';
    const allowed=isAdmin||isNursingManagerProfile(profile);
    const today=todayISOIndia();
    const yesterday=(()=>{const d=parseISODateUTC(today);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)})();
    const [day,setDay]=React.useState(yesterday);
    const [data,setData]=React.useState(null);
    const [loading,setLoading]=React.useState(false);
    const [err,setErr]=React.useState('');
    const [msg,setMsg]=React.useState('');
    const [busy,setBusy]=React.useState('');
    const [sends,setSends]=React.useState([]);

    async function load(refresh=false,d=day){
      if(!d||d>today){setErr('Choose a day up to today.');return}
      setLoading(true);setErr('');setMsg('');
      try{
        let {data:r,error}=await client.rpc('mis_daily_report',{p_day:d,p_refresh:!!refresh});
        // a busy day can take longer than the browser's database time limit the first time: prepare it on the server instead
        if(error&&/timeout|canceling statement/i.test(error.message||'')){
          const x=await client.functions.invoke('mis-daily-report-dispatch',{body:{mode:'json',day:d,refresh:!!refresh}});
          if(!x.error&&x.data?.ok){r=x.data.report;error=null}
        }
        if(error)throw error;
        setData(r);
        if(isAdmin)loadSends(d);
      }catch(e){setData(null);setErr(/timeout|canceling statement/i.test(e?.message||'')?'The report took too long to prepare. Please press Prepare again in a minute.':(e?.message||String(e)))}
      finally{setLoading(false)}
    }
    async function loadSends(d=day){
      try{const {data:rows}=await client.from('mis_daily_report_sends').select('recipient_name,recipient_number,variant,status,route,error_text,created_at,sent_at').eq('report_day',d).order('created_at',{ascending:false}).limit(30);setSends(rows||[])}catch{setSends([])}
    }
    React.useEffect(()=>{if(allowed)load(false,yesterday)},[]);

    async function downloadPptx(){
      if(!data)return;setBusy('pptx');setMsg('');
      try{const name=await buildDailyReportPptx(data);setMsg(`PowerPoint downloaded — ${name}. Open it in PowerPoint on Windows.`)}
      catch(e){setMsg('!PowerPoint could not be made: '+(e?.message||e))}
      finally{setBusy('')}
    }
    async function callSender(body){
      const {data:r,error}=await client.functions.invoke('mis-daily-report-dispatch',{body});
      if(error){let m=error.message||String(error);try{const j=await error.context?.json?.();if(j?.error)m=j.error}catch{}
        if(/not found|404|Failed to send a request/i.test(m))m='The WhatsApp / PDF sender (Edge Function mis-daily-report-dispatch) is not deployed yet.';throw new Error(m)}
      if(r&&r.ok===false)throw new Error(r.error||'Failed');
      return r;
    }
    async function downloadPdf(){
      if(!data)return;setBusy('pdf');setMsg('');
      try{
        const r=await callSender({mode:'pdf',day:data.day});
        const bin=atob(r.pdf_base64||'');const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
        const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
        const a=document.createElement('a');a.href=url;a.download=r.file_name||`Samara_Daily_Report_${data.day}.pdf`;document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),4000);
        setMsg(`PDF downloaded — the same file that goes on WhatsApp${data.variant==='care'?' to the Nursing Manager':''}.`);
      }catch(e){setMsg('!PDF could not be made: '+(e?.message||e))}
      finally{setBusy('')}
    }
    async function sendNow(){
      if(!data||data.partial)return;
      if(!window.confirm(`Send the ${data.day_label} Daily Report on WhatsApp now to the Directors (full) and the Nursing Manager (without money)? Anyone who already received it is skipped.`))return;
      setBusy('send');setMsg('');
      try{const r=await callSender({mode:'send',day:data.day});
        setMsg(r.disabled?r.message:`WhatsApp: sent ${r.sent||0}, failed ${r.failed||0}, already sent ${r.skipped||0}.`);loadSends(data.day)}
      catch(e){setMsg('!WhatsApp send failed: '+(e?.message||e))}
      finally{setBusy('')}
    }

    if(!allowed)return h(Section,{title:'Daily Report'},h('p',null,'Admin / Directors and the Nursing Manager only.'));
    const pick=d=>{setDay(d);load(false,d)};
    const sections=data?.sections||[];
    return h('div',{className:'mdr-wrap'},
      h(Section,{title:'Daily Report',subtitle:`All happenings of the day, midnight to midnight · PowerPoint for meetings, PDF on WhatsApp every morning at 07:00${isAdmin?'':' · Nursing copy (without money)'}`},
        h('div',{className:'mdr-bar'},
          h('div',{className:'mdr-chips'},
            h('button',{type:'button','aria-pressed':day===yesterday,onClick:()=>pick(yesterday)},'Yesterday'),
            h('button',{type:'button','aria-pressed':day===today,onClick:()=>pick(today)},'Today (so far)')),
          h('div',{className:'field'},h('label',{htmlFor:'mdr-day'},'Day'),h('input',{id:'mdr-day',type:'date',value:day,max:today,onChange:e=>setDay(e.target.value)})),
          h('button',{type:'button',className:'btn btn-primary',disabled:loading,onClick:()=>load(false)},loading?'Preparing…':'Show report')
        ),
        h('div',{className:'mdr-actions',style:{marginTop:'12px'}},
          h('button',{type:'button',className:'btn btn-primary',disabled:!data||loading||!!busy,onClick:downloadPptx},busy==='pptx'?'Making PowerPoint…':'⬇ PowerPoint'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!data||loading||!!busy,onClick:downloadPdf},busy==='pdf'?'Making PDF…':'⬇ PDF (WhatsApp copy)'),
          isAdmin&&h('button',{type:'button',className:'btn btn-secondary',disabled:!data||loading||!!busy||data?.partial,title:'Send this day’s report on WhatsApp now',onClick:sendNow},busy==='send'?'Sending…':'📲 Send on WhatsApp now'),
          isAdmin&&data&&!data.partial&&h('button',{type:'button',className:'btn btn-secondary',disabled:loading||!!busy,title:'Prepare this day again from the current ERP entries and replace the saved copy',onClick:()=>{if(window.confirm('Prepare this day again from the current ERP entries? The saved copy will be replaced.'))load(true)}},'↻ Prepare again')
        ),
        loading&&h('p',{className:'mdr-status'},'Preparing the report — this can take up to a minute the first time a day is prepared…'),
        err&&h('div',{className:'message error'},err),
        msg&&h('div',{className:`message ${msg.startsWith('!')?'error':'success'}`},msg.replace(/^!/,'')),
        data&&!loading&&h('p',{className:'mdr-status',style:{marginTop:'10px'}},
          h('b',null,`${data.day_label} (${data.weekday||''})`),' · ',
          data.partial?`today so far — figures up to ${data.generated_label}; not saved`
            :`saved copy prepared ${data.saved_label||data.generated_label}${data.saved_by?` by ${data.saved_by}`:''}${Number(data.prepared_count)>1?` · prepared ${data.prepared_count} times`:''}`,
          ' · ',`${sections.length} slides`,data.variant==='care'?' · Nursing copy (money slides left out)':'')
      ),
      !loading&&data&&sections.map(sec=>h('div',{key:sec.key,className:'mdr-sec'},
        h('h3',null,sec.title),h('small',null,sec.subtitle||''),
        (sec.kpis||[]).length>0&&h('div',{className:'mdr-kpis'},(sec.kpis||[]).map((k,i)=>{const c=mdrCompare(k);return h('div',{key:i,className:'mdr-kpi'},
          h('small',null,k.label),h('strong',null,mdrKpiValue(k)),c.text&&h('em',{className:c.tone},c.text))})),
        (sec.tables||[]).length>0&&h('div',{className:'mdr-tables'},(sec.tables||[]).map((t,ti)=>h('div',{key:ti,className:'mdr-table'},
          h('b',null,t.title),
          h('table',null,
            h('thead',null,h('tr',null,(t.cols||[]).map((c,i)=>h('th',{key:i,className:mdrIsMoneyCol(c)?'num':''},c)))),
            h('tbody',null,(t.rows||[]).length?(t.rows||[]).map((r,ri)=>h('tr',{key:ri},(t.cols||[]).map((c,i)=>h('td',{key:i,className:mdrIsMoneyCol(c)||typeof r[i]==='number'?'num':String(r[i]??'').length<=10?'mdr-short':''},mdrCell(c,r[i])))))
              :h('tr',null,h('td',{colSpan:(t.cols||[]).length||1,className:'mdr-empty'},t.error||'Nothing recorded')))),
          Number(t.total)>(t.rows||[]).length&&h('div',{className:'mdr-more'},`+ ${Number(t.total)-(t.rows||[]).length} more — see the ERP page`),
          t.note&&h('div',{className:'mdr-more'},t.note)
        )))
      )),
      isAdmin&&data&&!data.partial&&h(Section,{title:'WhatsApp copies for this day',subtitle:'Sent automatically at about 07:00 (re-tried until 09:00) · Directors get the full PDF, the Nursing Manager the copy without money'},
        sends.length?h('div',{className:'mdr-sends'},h('table',null,
          h('thead',null,h('tr',null,['Time','To','Copy','Status','Note'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,sends.map((r,i)=>h('tr',{key:i},
            h('td',null,formatDateTimeIN(r.sent_at||r.created_at)),h('td',null,`${r.recipient_name||''} · ${r.recipient_number}`),
            h('td',null,r.variant==='care'?'Nursing (no money)':'Full'),h('td',null,r.status),h('td',null,r.error_text||r.route||''))))))
          :h('p',{className:'mdr-status'},'No WhatsApp copy recorded for this day yet.'))
    );
  }
