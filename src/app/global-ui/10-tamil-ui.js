  // 2.15.70: EN | தமிழ் screen-language switch (trial for STD; Admin can also check).
  // Translates only fixed screen wording (menu, titles, buttons, labels, statuses) using SAMARA_TA.
  // It changes the text of existing text nodes (never replaces elements), so React keeps working;
  // anything not in the dictionary — and every name, note or value typed by staff — stays as it is.
  const SamaraLang=(()=>{
    const dict=new Map(Object.entries(typeof SAMARA_TA==='object'?SAMARA_TA:{}));
    const lower=new Map();dict.forEach((v,k)=>lower.set(k.toLowerCase(),v));
    let on=false,observer=null,queued=new Set(),scheduled=false;
    const textRec=new WeakMap(),attrRec=new WeakMap(),touchedText=new Set(),touchedEl=new Set();
    const ATTRS=['placeholder','title','aria-label'];
    const SKIP='script,style,textarea,code,pre,[contenteditable="true"],[data-no-translate],.samara-no-translate,.wa-bubble';
    function look(t){return dict.get(t)||lower.get(t.toLowerCase())||null}
    function translate(text,depth=0){
      const t=String(text||'').trim();
      if(!t||t.length>320||!/[A-Za-z]/.test(t))return null;
      const hit=look(t);if(hit)return hit;
      if(depth>3)return null;
      let m;
      if((m=/^(\d+)\s+(.+)$/.exec(t))){const a=translate(m[2],depth+1);return a?`${m[1]} ${a}`:null}                    // "3 this month"
      if((m=/^(.*?)\s*\((\d+)\)$/.exec(t))){const a=translate(m[1],depth+1);return a?`${a} (${m[2]})`:null}            // "All (12)"
      if((m=/^(.+?)\s+(\d+)$/.exec(t))&&!/\d[-/]\d/.test(t)){const a=translate(m[1],depth+1);if(a)return `${a} ${m[2]}`} // "Unread 0"
      if((m=/^([^A-Za-z0-9]+)(.+)$/.exec(t))){const a=translate(m[2],depth+1);return a?`${m[1].trim()} ${a}`:null}     // "+ New Enquiry", "← Back"
      if((m=/^(.+?)\s*([*:·→›]+)$/.exec(t))){const a=translate(m[1],depth+1);return a?`${a} ${m[2]}`:null}             // "Name *", "Status:"
      // 2.15.75: phrases joined with " · ", " — ", " – " or "Label: value" — translate each part, keep the rest (dates, names, numbers).
      for(const sep of [' · ',' — ',' – ',': ']){
        if(!t.includes(sep))continue;
        const parts=t.split(sep);let any=false;
        const out=parts.map(x=>{const y=x.trim();if(!y)return x;const a=translate(y,depth+1);if(a){any=true;return a}return y});
        if(any)return out.join(sep);
      }
      return null;
    }
    function skipped(el){try{return !el||!!el.closest(SKIP)}catch(_){return true}}
    function doText(node){
      const rec=textRec.get(node),val=node.nodeValue;
      if(rec&&val===rec.ta)return;                     // our own translation
      const ta=translate(val);
      if(!ta){if(rec)textRec.delete(node);return}
      if(skipped(node.parentElement))return;
      // 2.16.9: a dropdown option without a value attribute uses its text as the saved value — keep the English value.
      const opt=node.parentElement;if(opt&&opt.tagName==='OPTION'&&!opt.hasAttribute('value'))opt.setAttribute('value',String(val).trim());
      const lead=(/^\s*/.exec(val)||[''])[0],trail=(/\s*$/.exec(val)||[''])[0],out=lead+ta+trail;
      textRec.set(node,{en:val,ta:out});touchedText.add(node);node.nodeValue=out;
    }
    function doAttrs(el){
      if(skipped(el))return;
      let rec=attrRec.get(el);
      for(const a of ATTRS){
        if(!el.hasAttribute||!el.hasAttribute(a))continue;
        const val=el.getAttribute(a);if(rec&&rec[a]&&val===rec[a].ta)continue;
        const ta=translate(val);if(!ta)continue;
        rec=rec||{};rec[a]={en:val,ta};attrRec.set(el,rec);touchedEl.add(el);el.setAttribute(a,ta);
      }
    }
    function walk(root){
      if(!root)return;
      if(root.nodeType===3){doText(root);return}
      if(root.nodeType!==1)return;
      if(skipped(root))return;
      doAttrs(root);
      const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,null);
      let n;while((n=w.nextNode())){if(n.nodeType===3)doText(n);else doAttrs(n)}
    }
    function flush(){scheduled=false;const list=[...queued];queued.clear();if(!on)return;list.forEach(n=>{if(n.isConnected)walk(n)})}
    function queue(n){queued.add(n);if(!scheduled){scheduled=true;if(typeof window.requestAnimationFrame==='function')window.requestAnimationFrame(flush);else setTimeout(flush,16)}}
    function start(){
      if(observer)return;
      walk(document.body);
      observer=new MutationObserver(muts=>{for(const m of muts){
        if(m.type==='characterData')queue(m.target);
        else if(m.type==='attributes')queue(m.target);
        else m.addedNodes.forEach(queue);
      }});
      observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
    }
    function stop(){
      if(observer){observer.disconnect();observer=null}
      touchedText.forEach(n=>{const r=textRec.get(n);if(r&&n.nodeValue===r.ta)n.nodeValue=r.en;textRec.delete(n)});touchedText.clear();
      touchedEl.forEach(el=>{const r=attrRec.get(el)||{};Object.keys(r).forEach(a=>{if(el.getAttribute(a)===r[a].ta)el.setAttribute(a,r[a].en)});attrRec.delete(el)});touchedEl.clear();
    }
    function apply(lang){
      const want=lang==='ta';
      try{document.documentElement.lang=want?'ta':'en';document.body.classList.toggle('samara-lang-ta',want)}catch(_){}
      if(want===on)return;
      on=want;if(on)start();else stop();
      try{window.dispatchEvent(new CustomEvent('samara-lang',{detail:{lang:on?'ta':'en'}}))}catch(_){}
    }
    // 2.16.8: trial extended to named staff — ANM Dharshini (EMP-0018). Add more names / employee IDs here.
    const TRIAL_STAFF=[/\bdharshini\b/i];const TRIAL_IDS=['EMP-0018'];
    const trialStaff=p=>TRIAL_IDS.includes(String(p?.employee_id||'').toUpperCase())||TRIAL_STAFF.some(re=>re.test(String(p?.full_name||'')));
    const allowed=p=>['STD','Admin'].includes(String(p?.role||''))||Boolean(p?.__dutyContext?.roles?.includes('STD'))||trialStaff(p);
    return {
      allowed,translate,
      current:()=>on?'ta':'en',
      init(profile){
        if(!allowed(profile)){apply('en');return}
        let saved='';try{saved=localStorage.getItem('samara-ui-lang:'+profile.id)||''}catch(_){}
        apply(profile?.ui_language||saved||'en');
      },
      async set(lang,profile){
        apply(lang);
        try{localStorage.setItem('samara-ui-lang:'+(profile?.id||''),lang)}catch(_){}
        try{const {error}=await client.rpc('set_my_ui_language',{p_lang:lang});if(error)console.warn('Language not saved to profile (run SQL 198):',error.message)}catch(_){}
      }
    };
  })();
  window.SamaraLang=SamaraLang;

  function LanguageSwitch({profile}){
    const [lang,setLang]=React.useState(SamaraLang.current());
    React.useEffect(()=>{const f=e=>setLang(e?.detail?.lang||SamaraLang.current());window.addEventListener('samara-lang',f);return()=>window.removeEventListener('samara-lang',f)},[]);
    if(!SamaraLang.allowed(profile))return null;
    const btn=(code,label)=>h('button',{type:'button','aria-pressed':lang===code,className:lang===code?'active':'',onClick:()=>{setLang(code);SamaraLang.set(code,profile)}},label);
    return h('div',{className:'samara-lang-switch','data-no-translate':'true',role:'group','aria-label':'Screen language'},btn('en','EN'),btn('ta','தமிழ்'));
  }
  ;(function(){
    if(document.getElementById('samara-lang-css'))return;
    const st=document.createElement('style');st.id='samara-lang-css';
    st.textContent=`
      .samara-lang-switch{display:inline-flex;border:1px solid #e7acc8;border-radius:999px;overflow:hidden;background:#fff;margin:0 6px;flex:0 0 auto}
      .samara-lang-switch button{border:0;background:transparent;padding:6px 11px;font-weight:700;color:#8e1b4f;cursor:pointer;font-size:13px;line-height:1.2}
      .samara-lang-switch button.active{background:linear-gradient(135deg,#c2185b,#9e0142);color:#fff}
      body.samara-lang-ta .sidebar button,body.samara-lang-ta th,body.samara-lang-ta .btn{white-space:normal;line-height:1.25}
      body.samara-lang-ta .stores-dash-title{line-height:1.3}
      body.samara-lang-ta *{letter-spacing:normal!important} /* spacing breaks Tamil letters */
    `;
    document.head.appendChild(st);
  })();
