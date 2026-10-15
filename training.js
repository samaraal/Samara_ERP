/* Standalone sample-screen viewer. No production SDK, auth session or APIs. */
(() => {
  'use strict';
  const data=window.SAMARA_TRAINING;
  const $=id=>document.getElementById(id);
  const sessionKey='samara_training_viewer_v1';
  const money=value=>'₹'+Number(value).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  let page=data.pages[0];
  const create=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  function bounds(mode,from,to){
    if(mode==='All dates')return ['',''];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from))return null;
    if(mode==='Day')return [from,from];
    const date=new Date(from+'T00:00:00Z');
    if(Number.isNaN(date.getTime()))return null;
    if(mode==='Week'){date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));const start=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+6);return [start,date.toISOString().slice(0,10)];}
    if(mode==='Month')return [from.slice(0,7)+'-01',new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10)];
    return /^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to?[from,to]:null;
  }
  function showWorkspace(){ $('login').hidden=true;$('workspace').hidden=false;openPage(data.pages[0].name); }
  $('login-form').addEventListener('submit',event=>{
    event.preventDefault();
    if($('login-id').value.trim().toLowerCase()!=='training.viewer'||$('access-code').value!=='SamaraDemo2026'){
      $('login-error').textContent='Use the demo ID and demo code shown above. Live staff credentials do not work here.';return;
    }
    try{sessionStorage.setItem(sessionKey,'open');}catch(_){}
    $('access-code').value='';$('login-error').textContent='';showWorkspace();
  });
  $('sign-out').addEventListener('click',()=>{try{sessionStorage.removeItem(sessionKey);}catch(_){}$('workspace').hidden=true;$('login').hidden=false;$('access-code').value='';$('login-id').focus();});
  function buildNavigation(){
    const search=$('module-search').value.trim().toLowerCase();$('navigation').replaceChildren();
    for(const section of data.sections){
      const pages=data.pages.filter(p=>p.section===section.title&&(!search||p.label.toLowerCase().includes(search)||p.section.toLowerCase().includes(search)));
      if(!pages.length)continue;
      const group=create('details');group.open=Boolean(search)||page.section===section.title;
      const heading=create('summary',section.title);
      heading.addEventListener('click',event=>{event.preventDefault();openPage(pages[0].name);});
      group.append(heading);
      for(const item of pages){const button=create('button',item.label);button.type='button';if(item.name===page.name)button.setAttribute('aria-current','page');button.addEventListener('click',()=>openPage(item.name));group.append(button);}
      $('navigation').append(group);
    }
    if(!$('navigation').children.length)$('navigation').append(create('p','No matching modules.'));
  }
  function openPage(name){
    page=data.pages.find(p=>p.name===name)||data.pages[0];
    $('page-title').textContent=page.label;$('register-title').textContent=page.label+' · sample records';
    $('page-description').textContent=page.description;$('guide-text').textContent=page.guide;
    $('record-search').value='';$('period').value='All dates';
    const isAccounts=page.section==='ACCOUNTS / BILLING';$('period-label').hidden=!isAccounts;
    $('from-label').hidden=true;$('to-label').hidden=true;
    $('previous-page').disabled=data.pages.indexOf(page)===0;$('next-page').disabled=data.pages.indexOf(page)===data.pages.length-1;
    buildNavigation();renderRecords();
    $('page-title').setAttribute('tabindex','-1');$('page-title').focus({preventScroll:true});
    if(window.matchMedia?.('(max-width: 600px)').matches)$('page-title').scrollIntoView({block:'start',behavior:'smooth'});
  }
  function openDetails(row){
    $('detail-title').textContent=page.label+' · sample details';$('detail-content').replaceChildren();
    page.headers.forEach((key,i)=>{$('detail-content').append(create('dt',key),create('dd',row[i]));});
    $('detail-dialog').showModal();
  }
  function renderRecords(){
    const query=$('record-search').value.trim().toLowerCase(),range=bounds($('period').value,$('from-date').value,$('to-date').value);
    const dateIndex=page.headers.indexOf('Date'),isAccounts=page.section==='ACCOUNTS / BILLING';
    $('date-error').textContent=isAccounts&&!range?'Choose a valid date range. From must be on or before To.':'';
    const rows=page.rows.filter(row=>(!query||row.join(' ').toLowerCase().includes(query))&&(!isAccounts||(range&&(!range[0]||row[dateIndex]>=range[0])&&(!range[1]||row[dateIndex]<=range[1]))));
    $('record-count').textContent=rows.length+' sample '+(rows.length===1?'record':'records');
    $('overview').replaceChildren();
    const stats=isAccounts?[['Matching entries',String(rows.length)],['Total request amount',money(rows.reduce((sum,r)=>sum+Number(r[4]),0))],['Total approved amount',money(rows.reduce((sum,r)=>sum+Number(r[5]),0))]]:[['Sample records',String(rows.length)],['Training modules',String(data.pages.length)],['Access','View only']];
    for(const [label,value] of stats){const card=create('div',undefined,'stat');card.append(create('span',label),create('strong',value));$('overview').append(card);}
    const heading=create('tr');for(const label of [...page.headers,'Details'])heading.append(create('th',label));$('table-head').replaceChildren(heading);$('table-body').replaceChildren();
    for(const row of rows){const tr=create('tr');row.forEach((value,i)=>tr.append(create('td',isAccounts&&(i===4||i===5)?money(value):value)));const cell=create('td'),button=create('button','View details');button.type='button';button.addEventListener('click',()=>openDetails(row));cell.append(button);tr.append(cell);$('table-body').append(tr);}
    if(!rows.length){const tr=create('tr'),cell=create('td','No sample records match these filters.');cell.colSpan=page.headers.length+1;tr.append(cell);$('table-body').append(tr);}
  }
  $('module-search').addEventListener('input',buildNavigation);
  $('record-search').addEventListener('input',renderRecords);
  $('period').addEventListener('change',()=>{$('from-label').hidden=$('period').value==='All dates';$('to-label').hidden=$('period').value!=='Custom period';renderRecords();});
  for(const id of ['from-date','to-date'])$(id).addEventListener('change',renderRecords);
  $('close-detail').addEventListener('click',()=>$('detail-dialog').close());
  $('previous-page').addEventListener('click',()=>{const i=data.pages.indexOf(page);if(i>0)openPage(data.pages[i-1].name);});
  $('next-page').addEventListener('click',()=>{const i=data.pages.indexOf(page);if(i<data.pages.length-1)openPage(data.pages[i+1].name);});
  try{if(sessionStorage.getItem(sessionKey)==='open')showWorkspace();}catch(_){}
})();
