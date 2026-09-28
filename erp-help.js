/* Samara Care ERP — Help / உதவி assistant (2.14.79, 28-09-2026; 2.14.84: Samara logo + brand colours, formatted answers, bigger / enlarge; 2.14.81: typing box opts out of the ERP-wide 🎤 Voice / Dictate bar — Help has its own 🎙).
   A separate, self-contained file (not part of app.js) so it cannot break other pages.
   Staff ask how to use the ERP by Tamil/English voice, typing, or a screenshot; answers come from the
   erp-help-ai Supabase Edge Function. Screenshots and recordings are sent only to get the answer and are never stored. */
(function(){
'use strict';
var CFG=window.SAMARA_CONFIG||{};
if(!CFG.supabaseUrl||!CFG.supabasePublishableKey)return;
var FN=CFG.supabaseUrl.replace(/\/$/,'')+'/functions/v1/erp-help-ai';
var REF=(CFG.supabaseUrl.match(/https:\/\/([^.]+)\./)||[])[1]||'';
var TOKEN_KEY='sb-'+REF+'-auth-token';
var T={
 title:'Help · உதவி',sub:'ERP பயன்பாட்டு உதவி',bigger:'பெரிதாக்கு / Enlarge',smaller:'சிறிதாக்கு / Smaller',
 hello:'வணக்கம்! ERP-ஐப் பயன்படுத்துவதில் ஏதாவது சந்தேகமா? 🎙 அழுத்தி தமிழில் பேசுங்கள், கேள்வியைத் தட்டச்சு செய்யுங்கள், அல்லது 📷 மூலம் திரைப் படத்தை (screenshot) இணைக்கவும். ERP பயன்பாடு பற்றிய கேள்விகளுக்கு மட்டுமே உதவுவேன்.',
 ph:'உங்கள் கேள்வி… / Question',page:'இப்போதைய பக்கம்',
 rec:'கேட்கிறேன்… முடிந்ததும் ■ அழுத்துங்கள்',thinking:'பதில் தயாராகிறது…',listen:'🔊 கேட்க',stop:'■ நிறுத்து',
 shotNote:'Screenshot-ல் நோயாளியின் பெயர் / விவரங்கள் இருந்தால் முடிந்தவரை crop செய்யுங்கள். படம் சேமிக்கப்படாது.',
 remove:'நீக்கு',helpful:'உதவியதா?',yes:'👍 ஆம்',no:'👎 இல்லை',thanks:'நன்றி!',
 micErr:'இந்த உலாவியில் மைக் பயன்படுத்த முடியவில்லை. தட்டச்சு செய்யுங்கள்.',login:'மீண்டும் ERP-ல் login செய்யுங்கள்.',fail:'உதவி தற்போது கிடைக்கவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
 log:'📋 Staff questions',back:'← Help',noLog:'இன்னும் கேள்விகள் இல்லை.',logTitle:'Staff Help questions (latest 100)',open:'Help · உதவி'
};
var state={open:false,busy:false,history:[],image:null,rec:null,stream:null,chunks:[],timer:null,role:'',tab:'chat',audio:null};

function token(){try{var s=JSON.parse(localStorage.getItem(TOKEN_KEY)||'null');if(!s)return null;var t=s.access_token||(s.currentSession&&s.currentSession.access_token);var exp=s.expires_at||(s.currentSession&&s.currentSession.expires_at)||0;return t?{t:t,exp:exp*1000}:null}catch(e){return null}}
function loggedIn(){var k=token();return !!(k&&k.exp>Date.now()-60000)&&!document.querySelector('.login-shell')}
function fresh(){return new Promise(function(res){var k=token();if(k&&k.exp>Date.now()+20000)return res(k.t);setTimeout(function(){var k2=token();res(k2&&k2.exp>Date.now()?k2.t:null)},1800)})}
function currentPage(){var a=document.querySelector('[data-nav].active');if(a)return a.getAttribute('data-nav')||a.textContent.trim();var h=document.querySelector('.content h2,.content h1');return h?h.textContent.trim().slice(0,60):''}
function esc(s){var d=document.createElement('div');d.textContent=String(s==null?'':s);return d.innerHTML}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function dmy(v){var d=new Date(v);if(isNaN(d))return '';var p=function(n){return('0'+n).slice(-2)};var h=d.getHours();return p(d.getDate())+'-'+p(d.getMonth()+1)+'-'+d.getFullYear()+', '+p(h%12||12)+':'+p(d.getMinutes())+' '+(h>=12?'PM':'AM')}

// 2.14.84: show the AI's **bold**, numbered steps and "Button names" nicely (text is escaped first — no raw HTML).
function inline(t){
 return t.replace(/\*\*([^*]+?)\*\*/g,'<strong>$1</strong>')
  .replace(/`([^`]+?)`/g,'<span class="sh-ui">$1</span>')
  .replace(/(?:"|“)([^"“”<>\n]{1,48}?)(?:"|”)/g,'<span class="sh-ui">$1</span>');
}
function fmt(text){
 var lines=esc(text).split(/\n/),html='',list='';
 var close=function(){if(list){html+='</'+list+'>';list=''}};
 lines.forEach(function(raw){
  var l=raw.trim(),m;
  if(!l){close();return}
  if((m=l.match(/^(\d{1,2})[.)]\s+(.*)$/))){if(list!=='ol'){close();html+='<ol class="sh-steps">';list='ol'}html+='<li value="'+m[1]+'">'+inline(m[2])+'</li>';return}
  if((m=l.match(/^[-*•]\s+(.*)$/))){if(list!=='ul'){close();html+='<ul class="sh-bullets">';list='ul'}html+='<li>'+inline(m[1])+'</li>';return}
  close();
  if((m=l.match(/^#{1,4}\s+(.*)$/)))html+='<p class="sh-h">'+inline(m[1])+'</p>';else html+='<p>'+inline(l)+'</p>';
 });
 close();return html;
}

// ---------- UI ----------
var root,btn,panel,msgs,input,shotBox,micBtn,pageChip,logBtn;
function build(){
 root=el('div','sh-root');
 btn=el('button','sh-launch');btn.type='button';btn.setAttribute('aria-label','Samara Help — உதவி');btn.innerHTML='<span class="sh-launch-ic" aria-hidden="true">💬</span><span class="sh-launch-tx">'+esc(T.open)+'</span><span class="sh-launch-short">உதவி</span>';
 btn.onclick=toggle;
 panel=el('section','sh-panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-label',T.title);panel.hidden=true;
 panel.innerHTML='<header class="sh-head"><img class="sh-logo" src="./assets/samara-help-logo.png?v=2.14.84" alt="Samara" width="92" height="48"><div class="sh-title"><strong>'+esc(T.title)+'</strong><small>'+esc(T.sub)+'</small></div><button type="button" class="sh-log-btn" hidden title="Staff questions" aria-label="Staff questions"><span class="sh-log-ic">📋</span><span class="sh-log-tx">Staff questions</span></button><button type="button" class="sh-size" aria-label="'+esc(T.bigger)+'" title="'+esc(T.bigger)+'">⤢</button><button type="button" class="sh-x" aria-label="Close">×</button></header>'+
  '<div class="sh-page"></div><div class="sh-msgs" aria-live="polite"></div><div class="sh-shot" hidden></div>'+
  '<form class="sh-compose"><button type="button" class="sh-mic" aria-label="Tamil voice / பேசுங்கள்" title="பேசுங்கள் (Tamil / English)">🎙</button>'+
  '<label class="sh-attach" title="Screenshot இணைக்க" aria-label="Attach screenshot">📷<input type="file" accept="image/*" hidden></label>'+
  '<textarea rows="1" class="sh-input" data-samara-voice="off" placeholder="'+esc(T.ph)+'"></textarea><button class="sh-send" aria-label="Send">➤</button></form>';
 root.appendChild(btn);root.appendChild(panel);document.body.appendChild(root);
 msgs=panel.querySelector('.sh-msgs');input=panel.querySelector('.sh-input');shotBox=panel.querySelector('.sh-shot');micBtn=panel.querySelector('.sh-mic');pageChip=panel.querySelector('.sh-page');logBtn=panel.querySelector('.sh-log-btn');
 panel.querySelector('.sh-x').onclick=toggle;
 var sizeBtn=panel.querySelector('.sh-size');var setSize=function(big){panel.classList.toggle('sh-big',big);sizeBtn.textContent=big?'⤡':'⤢';sizeBtn.title=sizeBtn.ariaLabel=big?T.smaller:T.bigger;try{localStorage.setItem('samara-help-big',big?'1':'0')}catch(e){}};
 var wasBig=false;try{wasBig=localStorage.getItem('samara-help-big')==='1'}catch(e){}setSize(wasBig);
 sizeBtn.onclick=function(){setSize(!panel.classList.contains('sh-big'));scroll()};
 logBtn.onclick=function(){state.tab==='log'?showChat():showLog()};
 micBtn.onclick=function(){state.rec?stopRec():startRec()};
 panel.querySelector('.sh-attach input').onchange=function(e){var f=e.target.files&&e.target.files[0];e.target.value='';if(f)attach(f)};
 panel.querySelector('.sh-compose').onsubmit=function(e){e.preventDefault();send()};
 input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
 input.addEventListener('input',function(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,110)+'px'});
 panel.addEventListener('paste',function(e){var it=[].slice.call((e.clipboardData||{}).items||[]).find(function(i){return i.type&&i.type.indexOf('image')===0});if(it){e.preventDefault();attach(it.getAsFile())}});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&state.open&&!state.rec)toggle()});
 bot(T.hello);
}
function toggle(){
 state.open=!state.open;panel.hidden=!state.open;btn.classList.toggle('open',state.open);
 if(state.open){pageChip.textContent=T.page+': '+(currentPage()||'—');setTimeout(function(){input.focus()},50);whoami()}
 else{stopAudio();if(state.rec)stopRec(true)}
}
function scroll(){msgs.scrollTop=msgs.scrollHeight}
function user(text,img){var d=el('div','sh-msg sh-user');if(text)d.appendChild(el('div',null,text));if(img){var i=el('img');i.src=img;i.alt='screenshot';d.appendChild(i)}msgs.appendChild(d);scroll()}
function bot(text,opts){
 opts=opts||{};var d=el('div','sh-msg sh-bot');var body=el('div','sh-body');body.innerHTML=fmt(text);d.appendChild(body);
 if(opts.speakable){var row=el('div','sh-tools');var l=el('button','sh-tool',T.listen);l.type='button';l.onclick=function(){speak(text,opts.language,l)};row.appendChild(l);
  if(opts.id){var q=el('span','sh-q',T.helpful);row.appendChild(q);[['yes',true],['no',false]].forEach(function(p){var b=el('button','sh-tool',T[p[0]]);b.type='button';b.onclick=function(){feedback(opts.id,p[1],row)};row.appendChild(b)})}
  d.appendChild(row);opts.speakBtn=l}
 msgs.appendChild(d);scroll();return opts;
}
function thinking(on){var t=msgs.querySelector('.sh-thinking');if(on&&!t){t=el('div','sh-msg sh-bot sh-thinking');t.innerHTML='<span class="sh-dots"><i></i><i></i><i></i></span> '+esc(T.thinking);msgs.appendChild(t);scroll()}if(!on&&t)t.remove();
 panel.querySelectorAll('.sh-send,.sh-mic,.sh-attach input,.sh-input').forEach(function(x){x.disabled=on&&!(x.classList.contains('sh-mic')&&state.rec)})}

// ---------- screenshot ----------
function attach(file){
 if(!file||!/^image\//.test(file.type))return;
 var img=new Image(),url=URL.createObjectURL(file);
 img.onload=function(){
  var max=1600,w=img.naturalWidth,h=img.naturalHeight,s=Math.min(1,max/Math.max(w,h));
  var c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
  c.toBlob(function(b){state.image={blob:b,preview:c.toDataURL('image/jpeg',.5)};showShot()},'image/jpeg',.82);
 };
 img.onerror=function(){URL.revokeObjectURL(url)};img.src=url;
}
function showShot(){
 shotBox.hidden=!state.image;shotBox.innerHTML='';if(!state.image)return;
 var i=el('img');i.src=state.image.preview;i.alt='screenshot';shotBox.appendChild(i);
 var t=el('p',null,T.shotNote);shotBox.appendChild(t);
 var x=el('button','sh-tool',T.remove);x.type='button';x.onclick=function(){state.image=null;showShot()};shotBox.appendChild(x);
}

// ---------- voice ----------
function bestMime(){var a=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];for(var i=0;i<a.length;i++){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported(a[i]))return a[i]}catch(e){}}return''}
function startRec(){
 if(state.busy)return;stopAudio();
 if(!navigator.mediaDevices||!window.MediaRecorder){bot(T.micErr);return}
 navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(stream){
  state.stream=stream;state.chunks=[];var mime=bestMime();var r=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);state.rec=r;
  r.ondataavailable=function(e){if(e.data&&e.data.size)state.chunks.push(e.data)};
  r.onstop=function(){var type=r.mimeType||'audio/webm';var blob=new Blob(state.chunks,{type:type});stream.getTracks().forEach(function(t){t.stop()});state.stream=null;var cancelled=state.cancelRec;state.rec=null;state.cancelRec=false;recUI(false);if(!cancelled&&blob.size>1500)send(blob,type)};
  r.start();recUI(true);clearTimeout(state.timer);state.timer=setTimeout(function(){stopRec()},60000);
 }).catch(function(){bot(T.micErr)});
}
function stopRec(cancel){clearTimeout(state.timer);if(state.rec&&state.rec.state!=='inactive'){state.cancelRec=!!cancel;state.rec.stop()}}
function recUI(on){micBtn.classList.toggle('rec',on);micBtn.textContent=on?'■':'🎙';input.placeholder=on?T.rec:T.ph;input.disabled=on;panel.querySelector('.sh-send').disabled=on}

// ---------- ask ----------
function send(audioBlob,audioType){
 if(state.busy)return;
 var text=input.value.trim();if(!text&&!audioBlob&&!state.image)return;
 var page=currentPage(),img=state.image;
 user(audioBlob?'🎙 '+(text||'…'):text,img&&img.preview);input.value='';input.style.height='';
 state.image=null;showShot();state.busy=true;thinking(true);
 fresh().then(function(tok){
  if(!tok)throw {status:401};
  var headers={apikey:CFG.supabasePublishableKey,Authorization:'Bearer '+tok},body;
  if(audioBlob||img){body=new FormData();body.append('message',text);body.append('page',page);body.append('history',JSON.stringify(state.history.slice(-6)));
   if(audioBlob)body.append('audio',audioBlob,'question.'+(audioType.indexOf('mp4')>=0?'m4a':audioType.indexOf('ogg')>=0?'ogg':'webm'));
   if(img)body.append('image',img.blob,'screenshot.jpg');}
  else{headers['Content-Type']='application/json';body=JSON.stringify({message:text,page:page,history:state.history.slice(-6)})}
  return fetch(FN,{method:'POST',headers:headers,body:body,signal:AbortSignal.timeout?AbortSignal.timeout(70000):undefined});
 }).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok||!j.reply)throw {status:r.status,msg:j.error};return j})})
 .then(function(j){
  thinking(false);
  if(audioBlob&&j.transcript){var last=msgs.querySelectorAll('.sh-user');last=last[last.length-1];if(last&&last.firstChild)last.firstChild.textContent='🎙 '+j.transcript}
  state.history.push({role:'user',content:(j.transcript||text||'(screenshot)').slice(0,800)},{role:'assistant',content:j.reply.slice(0,800)});state.history=state.history.slice(-8);
  var o=bot(j.reply,{speakable:true,language:j.language,id:j.id});
  if(audioBlob)speak(j.reply,j.language,o.speakBtn);
 }).catch(function(e){thinking(false);bot(e&&e.status===401?T.login:(e&&e.msg)||T.fail)})
 .finally(function(){state.busy=false;thinking(false)});
}

// ---------- spoken reply ----------
function stopAudio(){if(state.audio){try{state.audio.pause()}catch(e){}state.audio=null}panel&&panel.querySelectorAll('.sh-tool.playing').forEach(function(b){b.classList.remove('playing');b.textContent=T.listen})}
function speak(text,language,button){
 if(button&&button.classList.contains('playing')){stopAudio();return}
 stopAudio();if(button){button.classList.add('playing');button.textContent=T.stop}
 fresh().then(function(tok){if(!tok)throw 0;return fetch(FN,{method:'POST',headers:{apikey:CFG.supabasePublishableKey,Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify({mode:'speech',text:text,language:language||'ta'})})})
 .then(function(r){if(!r.ok)throw 0;return r.blob()}).then(function(b){
  var a=new Audio(URL.createObjectURL(b));state.audio=a;a.onended=function(){stopAudio()};return a.play();
 }).catch(function(){stopAudio()});
}
function feedback(id,ok,row){
 fresh().then(function(tok){return fetch(CFG.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/erp_help_feedback',{method:'POST',headers:{apikey:CFG.supabasePublishableKey,Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify({p_id:id,p_helpful:ok})})}).catch(function(){});
 row.querySelectorAll('.sh-q,.sh-tool:not(:first-child)').forEach(function(x){x.remove()});row.appendChild(el('span','sh-q',T.thanks));
}

// ---------- Admin: staff questions ----------
function whoami(){
 if(state.role)return;
 fresh().then(function(tok){if(!tok)return;return fetch(FN,{method:'POST',headers:{apikey:CFG.supabasePublishableKey,Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify({mode:'whoami'})}).then(function(r){return r.json()}).then(function(j){state.role=j&&j.role||'';logBtn.hidden=state.role!=='Admin'})}).catch(function(){});
}
function showChat(){state.tab='chat';logBtn.querySelector('.sh-log-tx').textContent='Staff questions';logBtn.querySelector('.sh-log-ic').textContent='📋';panel.classList.remove('sh-log-mode');var l=panel.querySelector('.sh-log');if(l)l.remove()}
function showLog(){
 state.tab='log';logBtn.querySelector('.sh-log-tx').textContent='Help';logBtn.querySelector('.sh-log-ic').textContent='←';panel.classList.add('sh-log-mode');
 var box=el('div','sh-log');box.appendChild(el('h4',null,T.logTitle));var list=el('div','sh-log-list','…');box.appendChild(list);panel.insertBefore(box,panel.querySelector('.sh-msgs'));
 fresh().then(function(tok){return fetch(CFG.supabaseUrl.replace(/\/$/,'')+'/rest/v1/erp_help_questions?select=created_at,staff_name,staff_role,page,question,answer,via_voice,had_screenshot,helpful&order=created_at.desc&limit=100',{headers:{apikey:CFG.supabasePublishableKey,Authorization:'Bearer '+tok}})})
 .then(function(r){return r.json()}).then(function(rows){
  list.textContent='';if(!Array.isArray(rows)||!rows.length){list.textContent=T.noLog;return}
  rows.forEach(function(r){var d=el('details','sh-log-row');var s=el('summary');
   s.innerHTML='<span class="sh-log-meta">'+esc(dmy(r.created_at))+' · '+esc(r.staff_name||'')+' ('+esc(r.staff_role||'')+')'+(r.page?' · '+esc(r.page):'')+(r.via_voice?' · 🎙':'')+(r.had_screenshot?' · 📷':'')+(r.helpful===true?' · 👍':r.helpful===false?' · 👎':'')+'</span><span class="sh-log-q">'+esc(r.question)+'</span>';
   d.appendChild(s);d.appendChild(el('p',null,r.answer||''));list.appendChild(d)});
 }).catch(function(){list.textContent=T.fail});
}

// ---------- show only while logged in ----------
function sync(){var on=loggedIn();if(on&&!root)build();if(root){root.hidden=!on;if(!on&&state.open)toggle()}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
setInterval(sync,2000);window.addEventListener('storage',sync);
})();
