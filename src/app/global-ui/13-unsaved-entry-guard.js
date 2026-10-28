  // 2.18.97 GLOBAL WATCHER: Unsaved-entry guard + device drafts.
  // Problem (23-10-2026): with frequent ERP updates, the "Update Now" box reloaded the page while staff were typing,
  // and half-filled entries were lost. This file:
  //   1. knows when a form on screen has unsaved typing (SamaraDrafts.unsavedCount) — the update box waits for it;
  //   2. keeps a DRAFT of every form on THIS device every few seconds (localStorage, per signed-in user);
  //   3. when the same form is opened again (after an update, reload, crash, idle sign-out), offers
  //      "Unsaved entry from 9:42 PM — Restore / Discard" in a bar at the bottom of the screen;
  //   4. deletes the draft as soon as the entry is saved (success message), after 12 hours, and on Sign Out.
  // The Admission form keeps its own draft system (local + server drafts) and is only watched for "unsaved typing".
  // Search / filter boxes and anything inside a "filter" area are ignored. Nothing is sent to the server.
  (function samaraUnsavedEntryGuard(){
    if(window.SamaraDrafts)return;
    const PREFIX='samara_draft:v1:';
    const MAX_AGE_MS=12*60*60*1000;
    const SUCCESS_SEL='.samara-toast.success,.samara-toast.warning,.message.success,.toast.success,.toast.warning,[data-toast-type="success"],[data-toast-type="warning"]';
    const ERROR_SEL='.samara-toast.error,.message.error,.toast.error,[data-toast-type="error"]';
    const SAVE_WORDS=/\b(save|submit|confirm|record|add|administer|give|approve|send|update|mark|complete|start|post|raise|request|receive|issue|hand\s*over|return|discharge|admit|book|create|register|done)\b/i;
    const NOT_SAVE_WORDS=/\b(cancel|close|back|discard|remove|delete|clear|reset|restore|not now|later|filter|apply|search|print|download|excel|pdf|view|show|hide|edit|scan|read|upload|choose|select|camera|voice|mic)\b/i;
    const SKIP_TYPES=new Set(['hidden','file','password','search','button','submit','reset','image','range','color']);
    const TYPED_TYPES=new Set(['','text','number','tel','email','url','date','time','datetime-local','month','week']);
    const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const hash=s=>{let x=5381;for(let i=0;i<s.length;i++)x=((x<<5)+x+s.charCodeAt(i))|0;return (x>>>0).toString(36)};
    const ls={
      get:k=>{try{return localStorage.getItem(k)}catch(_){return null}},
      set:(k,v)=>{try{localStorage.setItem(k,v);return true}catch(_){return false}},
      del:k=>{try{localStorage.removeItem(k)}catch(_){}},
      keys:()=>{try{const out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(PREFIX))out.push(k)}return out}catch(_){return []}}
    };
    let userId='';
    try{client.auth.getSession().then(r=>{userId=r?.data?.session?.user?.id||''}).catch(()=>{})}catch(_){}
    try{client.auth.onAuthStateChange((_e,s)=>{userId=s?.user?.id||''})}catch(_){}
    const currentPage=()=>String(window.samaraCurrentPage||'');

    // ---------- which fields / which form ----------
    function trackable(el){
      if(!(el instanceof Element)||!el.matches('input,textarea,select'))return false;
      if(!el.closest('section.content,.modal-backdrop,[role="dialog"]'))return false;
      if(el.closest('#samara-draft-bar,#samara-update-refresh-prompt,[data-no-draft],[class*="filter"],.sr-filters,.global-search,.nurse-saver'))return false;
      const t=String(el.type||'').toLowerCase();
      if(el.tagName==='INPUT'&&SKIP_TYPES.has(t))return false;
      if(el.disabled)return false;
      if((t==='checkbox'||t==='radio')&&el.closest('table'))return false; // table ticks act at once (e.g. roster grid) — never replay them
      const hint=`${el.getAttribute('placeholder')||''} ${el.getAttribute('aria-label')||''} ${el.name||''} ${el.className||''}`;
      if(/search|filter|lookup/i.test(hint))return false;
      return true;
    }
    function containerOf(el){
      return el.closest('form')||el.closest('.modal-card,.modal,[role="dialog"]')||el.closest('.section-card,.card,.panel')||el.closest('section.content');
    }
    function titleOf(c){
      const hd=c.querySelector('h1,h2,h3,h4,legend,.modal-title');
      let t=hd?hd.textContent:'';
      if(!clean(t)){const up=c.parentElement&&c.parentElement.closest('.section-card,.card,.panel,.modal-card');const h2=up&&up.querySelector('h1,h2,h3,h4');t=h2?h2.textContent:''}
      return clean(t).slice(0,80);
    }
    function labelOf(el){
      const f=el.closest('.field,.check-card,label');let l='';
      if(f){const lab=f.matches('label')?f:f.querySelector('label');l=clean(lab?lab.textContent:'')}
      if(!l)l=clean(el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.name||el.id||'');
      return `${el.tagName}:${String(el.type||'').toLowerCase()}:${l.replace(/\*/g,'').trim().slice(0,60)}`;
    }
    function fieldIds(c){
      const seen={};
      return [...c.querySelectorAll('input,textarea,select')].filter(el=>trackable(el)&&containerOf(el)===c).map(el=>{const b=labelOf(el);seen[b]=(seen[b]||0)+1;return {el,id:`${b}#${seen[b]}`}});
    }
    const keyCache=new WeakMap();
    function keyOf(c){
      if(keyCache.has(c))return keyCache.get(c);
      const ids=fieldIds(c).slice(0,3).map(x=>x.id);
      const sig=`${currentPage()}|${titleOf(c)}|${ids.join(',')}`;
      const k=`${PREFIX}${userId||'anon'}:${hash(sig)}`;
      if(userId)keyCache.set(c,k);return k;
    }
    const ownDrafts=c=>Boolean(c.closest('.admission-form')); // Admission has its own drafts

    // ---------- state ----------
    const state=new Map(); // container -> {dirty, lastInputAt, pendingSaveAt, timer}
    const seenAt=new WeakMap();
    const dismissed=new Set();
    let restoring=false;

    function snapshot(c){
      const list=fieldIds(c).map(({el,id})=>{
        const t=String(el.type||'').toLowerCase();
        if(t==='checkbox'||t==='radio')return {id,checked:el.checked,value:el.value};
        return {id,value:el.value};
      });
      // a "Guest / Patient" dropdown, if any, to show whose entry it is
      let guest='';
      for(const {el,id} of fieldIds(c)){if(el.tagName==='SELECT'&&/guest|patient|resident/i.test(id)&&el.value){guest=clean(el.options[el.selectedIndex]?.textContent).slice(0,60);break}}
      const preview=list.filter(f=>f.checked===undefined&&/^(INPUT:(text|number|tel|email)?:|TEXTAREA:)/.test(f.id)&&clean(f.value)&&!/^\+91$/.test(clean(f.value))).map(f=>clean(f.value).slice(0,40)).slice(0,3);
      return {list,guest,preview};
    }
    function writeDraft(c){
      const st=state.get(c);if(!st||!st.dirty||ownDrafts(c)||!userId)return;
      const s=snapshot(c);
      if(!s.list.length)return;
      ls.set(keyOf(c),JSON.stringify({v:1,userId,page:currentPage(),title:titleOf(c),guest:s.guest,preview:s.preview,savedAt:Date.now(),fields:s.list}));
    }
    function scheduleWrite(c){const st=state.get(c);if(!st)return;clearTimeout(st.timer);st.timer=setTimeout(()=>writeDraft(c),1500)}
    function markSaved(c){const st=state.get(c);if(st){clearTimeout(st.timer);st.dirty=false;st.pendingSaveAt=0}ls.del(keyOf(c))}
    function flushAll(){state.forEach((st,c)=>{if(st.dirty){clearTimeout(st.timer);writeDraft(c)}})}

    function onInput(e){
      if(restoring)return;
      const el=e.target;if(!trackable(el))return;
      // voice typing fills the field the nurse is in (not a real key press) — count it; other code changing fields does not count
      if(!e.isTrusted&&document.activeElement!==el)return;
      const c=containerOf(el);if(!c)return;
      const t=String(el.type||'').toLowerCase();
      // Only typing (text, numbers, dates, times, notes) or ticking a box makes an entry "unsaved work";
      // choosing from a dropdown alone does not (dropdowns are still kept in the draft).
      const typed=el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&(TYPED_TYPES.has(t)||t==='checkbox'||t==='radio'));
      let st=state.get(c);
      if(!st){st={dirty:false,lastInputAt:0,pendingSaveAt:0,timer:null};state.set(c,st);keyOf(c)}
      if(typed)st.dirty=true;
      st.lastInputAt=Date.now();
      if(st.dirty)scheduleWrite(c);
    }
    function onClick(e){
      const b=e.target instanceof Element?e.target.closest('button,input[type="submit"]'):null;if(!b)return;
      const c=containerOf(b);const st=c&&state.get(c);if(!st||!st.dirty)return;
      const text=clean(b.textContent||b.value||b.getAttribute('aria-label'));
      if(b.type==='submit'||(SAVE_WORDS.test(text)&&!NOT_SAVE_WORDS.test(text)))st.pendingSaveAt=Date.now();
    }
    function onSubmit(e){const c=e.target instanceof Element?containerOf(e.target):null;const st=c&&state.get(c);if(st)st.pendingSaveAt=Date.now()}
    document.addEventListener('input',onInput,true);
    document.addEventListener('change',onInput,true);
    document.addEventListener('click',onClick,true);
    document.addEventListener('submit',onSubmit,true);
    window.addEventListener('pagehide',flushAll);
    window.addEventListener('beforeunload',flushAll);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushAll()});

    // ---------- drafts on this device ----------
    // 2.18.194: "Not now" / "Discard" are remembered on this device until that entry changes again
    // (it used to be forgotten on every reload / sign-in, so the same reminder came back each login).
    const DISMISS_KEY='samara_draft_dismissed:v1';
    const dismissedMap=()=>{try{return JSON.parse(ls.get(DISMISS_KEY)||'{}')||{}}catch(_){return {}}};
    function rememberDismiss(list){const m=dismissedMap();const now=Date.now();
      list.forEach(d=>{m[d.key]=Number(d.savedAt||0)});
      Object.keys(m).forEach(k=>{if(now-Number(m[k]||0)>MAX_AGE_MS)delete m[k]});
      ls.set(DISMISS_KEY,JSON.stringify(m))}
    const isDismissed=d=>dismissed.has(d.key)||Number(dismissedMap()[d.key]||-1)===Number(d.savedAt||0);
    function readDraft(k){try{const d=JSON.parse(ls.get(k)||'null');return d&&d.v===1?d:null}catch(_){return null}}
    function myDrafts(){
      const now=Date.now(),out=[];
      for(const k of ls.keys()){
        const d=readDraft(k);
        if(!d||now-Number(d.savedAt||0)>MAX_AGE_MS){ls.del(k);continue}
        if(userId&&k.startsWith(`${PREFIX}${userId}:`))out.push({key:k,...d});
      }
      return out.sort((a,b)=>b.savedAt-a.savedAt);
    }
    const fmtTime=ms=>{try{const d=new Date(ms);const t=d.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Kolkata'}).toUpperCase();const day=typeof formatDateIN==='function'?formatDateIN(d.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})):'';return day?`${day} ${t}`:t}catch(_){return ''}};

    async function restore(c,d){
      const setVal=(el,v)=>{
        const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        const desc=Object.getOwnPropertyDescriptor(proto,'value');
        if(desc&&desc.set)desc.set.call(el,v);else el.value=v;
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
      };
      restoring=true;const done=new Set();
      try{
        // Several passes: fields that appear only after an earlier choice (e.g. "Oxygen required" → instruction) are filled next pass.
        for(let pass=0;pass<5&&done.size<d.fields.length;pass++){
          const cur=new Map(fieldIds(c).map(x=>[x.id,x.el]));
          for(const f of d.fields){
            if(done.has(f.id))continue;
            const el=cur.get(f.id);if(!el||!el.isConnected||el.disabled)continue;
            const t=String(el.type||'').toLowerCase();
            if(f.checked!==undefined&&(t==='checkbox'||t==='radio')){
              if(t==='checkbox'?el.checked!==f.checked:(f.checked&&!el.checked)){el.click();await wait(45)}
              done.add(f.id);continue;
            }
            if(String(el.value)===String(f.value)){done.add(f.id);continue}
            if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===String(f.value)))continue; // list not loaded yet → next pass
            setVal(el,String(f.value??''));done.add(f.id);await wait(45);
          }
          await wait(300);
        }
      }finally{restoring=false}
      let st=state.get(c);if(!st){st={dirty:true,lastInputAt:Date.now(),pendingSaveAt:0,timer:null};state.set(c,st)}
      st.dirty=true;writeDraft(c);
      return {filled:done.size,total:d.fields.length};
    }

    // ---------- the bottom bar ----------
    let bar=null,barFor=null,summaryShown=false;
    function ensureStyle(){
      if(document.getElementById('samara-draft-bar-style'))return;
      const s=document.createElement('style');s.id='samara-draft-bar-style';
      s.textContent=`#samara-draft-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99990;width:min(620px,calc(100vw - 24px));background:linear-gradient(135deg,#fff 0%,#fde7f1 100%);border:2px solid #e48ab3;border-radius:16px;box-shadow:0 10px 32px rgba(122,18,71,.22);padding:12px 14px;font-family:inherit;color:#3b1028}
      #samara-draft-bar b{color:#a3134f}#samara-draft-bar .sdb-sub{font-size:13px;color:#6b4a5b;margin-top:3px;word-break:break-word}
      #samara-draft-bar .sdb-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      #samara-draft-bar button{border:0;border-radius:10px;padding:9px 14px;font-weight:800;font-size:14px;cursor:pointer}
      #samara-draft-bar .sdb-main{background:#c2185b;color:#fff}#samara-draft-bar .sdb-alt{background:#fff;color:#a3134f;border:1.5px solid #e48ab3}
      .samara-draft-target{outline:3px dashed #e48ab3!important;outline-offset:4px}`;
      document.head.appendChild(s);
    }
    function hideBar(){if(bar)bar.remove();bar=null;if(barFor&&barFor.c)barFor.c.classList.remove('samara-draft-target');barFor=null}
    function showBar(title,sub,buttons,target){
      ensureStyle();hideBar();
      bar=document.createElement('div');bar.id='samara-draft-bar';bar.setAttribute('role','status');
      const t=document.createElement('div');t.innerHTML='';const b1=document.createElement('b');b1.textContent=title;t.appendChild(b1);bar.appendChild(t);
      if(sub){const s=document.createElement('div');s.className='sdb-sub';s.textContent=sub;bar.appendChild(s)}
      const row=document.createElement('div');row.className='sdb-btns';
      buttons.forEach(([label,cls,fn])=>{const x=document.createElement('button');x.type='button';x.className=cls;x.textContent=label;x.addEventListener('click',fn);row.appendChild(x)});
      bar.appendChild(row);document.body.appendChild(bar);
      barFor=target||{};if(target&&target.c)target.c.classList.add('samara-draft-target');
    }
    function offer(c,d){
      const sub=[d.title&&`Form: ${d.title}`,d.guest&&`Guest: ${d.guest}`,d.preview&&d.preview.length&&`“${d.preview.join(' · ')}”`].filter(Boolean).join('  ·  ');
      showBar(`📝 Unsaved entry from ${fmtTime(d.savedAt)} — kept on this device`,sub,[
        ['Restore','sdb-main',async()=>{
          const k=d.key;hideBar();dismissed.add(k);
          try{c.scrollIntoView({behavior:'smooth',block:'start'})}catch(_){}
          const r=await restore(c,d);
          showBar(`✓ Entry restored (${r.filled} of ${r.total} fields)`,'Please check every field, then press Save.',[['OK','sdb-main',hideBar]]);
          setTimeout(()=>{if(bar&&/restored/.test(bar.textContent))hideBar()},9000);
        }],
        ['Discard','sdb-alt',()=>{if(!window.confirm('Discard this unsaved entry? It cannot be brought back.'))return;ls.del(d.key);dismissed.add(d.key);hideBar()}],
        ['Not now','sdb-alt',()=>{dismissed.add(d.key);rememberDismiss([d]);hideBar()}]
      ],{c,key:d.key});
    }
    function offerSummary(list){
      summaryShown=true;
      const sub=list.slice(0,4).map(d=>`${d.page||'Page'}${d.title?` — ${d.title}`:''} (${fmtTime(d.savedAt)})`).join('\n');
      const buttons=list.slice(0,3).filter((d,i,a)=>d.page&&a.findIndex(x=>x.page===d.page)===i).map(d=>[`Open ${d.page}`,'sdb-main',()=>{hideBar();window.dispatchEvent(new CustomEvent('samara-open-page',{detail:{page:d.page}}))}]);
      buttons.push(['Discard all','sdb-alt',()=>{if(!window.confirm(`Discard ${list.length===1?'this unsaved entry':`these ${list.length} unsaved entries`}? ${list.length===1?'It':'They'} cannot be brought back.`))return;list.forEach(d=>{ls.del(d.key);dismissed.add(d.key)});hideBar()}]);
      buttons.push(['Not now','sdb-alt',()=>{list.forEach(d=>dismissed.add(d.key));rememberDismiss(list);hideBar()}]);
      showBar(`📝 You have ${list.length} unsaved ${list.length===1?'entry':'entries'} on this device`,`${sub}\nOpen the same form again to restore it.`,buttons,{summary:true});
      const s=bar&&bar.querySelector('.sdb-sub');if(s)s.style.whiteSpace='pre-line';
    }

    // ---------- every second ----------
    function tick(){
      const now=Date.now();
      const success=[...document.querySelectorAll(SUCCESS_SEL)];
      success.forEach(n=>{if(!seenAt.has(n))seenAt.set(n,now)});
      const errorVisible=Boolean(document.querySelector(ERROR_SEL));
      state.forEach((st,c)=>{
        const pending=st.pendingSaveAt&&now-st.pendingSaveAt<30000;
        if(pending&&success.some(n=>(seenAt.get(n)||0)>=st.pendingSaveAt-100)){markSaved(c);state.delete(c);return}
        if(!c.isConnected){
          if(pending&&now-st.pendingSaveAt<10000&&!errorVisible)markSaved(c); // form closed right after Save → saved
          else if(st.dirty){clearTimeout(st.timer);writeDraft(c)} // closed without saving → keep the draft
          state.delete(c);
        }
      });
      if(!userId||restoring)return;
      // 2.18.194: only inside the ERP — never on the sign-in screen (shown after the 30-minute idle sign-out)
      if(!document.querySelector('section.content')){if(bar&&barFor&&barFor.summary)hideBar();return}
      if(bar&&barFor&&barFor.c&&!barFor.c.isConnected)hideBar();
      if(bar)return;
      const drafts=myDrafts().filter(d=>!isDismissed(d));
      if(!drafts.length)return;
      const page=currentPage();
      const here=drafts.filter(d=>d.page===page);
      if(here.length){
        const byKey=new Map(here.map(d=>[d.key,d]));
        const seen=new Set();
        for(const el of document.querySelectorAll('section.content input,section.content textarea,section.content select,.modal-backdrop input,.modal-backdrop textarea,.modal-backdrop select')){
          if(!trackable(el))continue;
          const c=containerOf(el);if(!c||seen.has(c))continue;seen.add(c);
          if(ownDrafts(c))continue;
          const st=state.get(c);if(st&&st.dirty)continue;
          const d=byKey.get(keyOf(c));
          if(d){offer(c,d);return}
        }
      }
      if(!summaryShown){const others=drafts.filter(d=>d.page!==page);if(others.length)offerSummary(drafts)}
    }
    setInterval(tick,1000);

    window.SamaraDrafts={
      // forms on screen with typing that is not saved yet (the update box waits for these)
      unsavedCount(){let n=0;state.forEach((st,c)=>{if(st.dirty&&c.isConnected)n++});return n},
      flush:flushAll,
      // Sign Out on this device: remove this user's drafts (Guest details must not stay on a shared device)
      clearForSignOut(){try{const id=userId;ls.keys().forEach(k=>{if(!id||k.startsWith(`${PREFIX}${id}:`))ls.del(k)});state.clear();hideBar()}catch(_){}}
    };
  })();
