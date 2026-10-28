  // 2.19.6: GLOBAL — every dropdown (<select>) lists its choices in A–Z order (Admin request 29-10-2026).
  // Kept in place: the first "Select … / All / — / Choose / Any / None" choice stays on top, "Other(s)" stays last.
  // Left in their natural order (sorting would make them wrong): months, weekdays, shifts, times, periods
  // (Today / This Week …), levels (Low / Medium / High, Mild / Severe …), Yes / No, and number lists (sorted 1, 2, 10).
  // A dropdown can opt out with data-keep-order. Selection is never changed — only the order the choices appear in.
  (function samaraAlphabeticalDropdowns(){
    const TOP=/^(\s*|select\b.*|choose\b.*|all\b.*|any\b.*|none\b.*|—.*|-+.*|--.*|\(.*\)|not set.*|no .*selected.*)$/i;
    const LAST=/^(others?|other \(.*\)|others? \/ .*|other – .*|other - .*)$/i;
    const ORDERED=/^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?|morning|afternoon|evening|night|general|day shift|night shift|today|yesterday|tomorrow|this (week|month|year)|last (week|month|year)|next (week|month)|custom|low|medium|moderate|high|critical|urgent|routine|normal|mild|severe|very high|very low|yes|no|first|second|third|daily|weekly|monthly|yearly|once|twice|hourly|stat|sos|pending|in progress|completed?|done|start|end)\b/i;
    const TIMEISH=/^\s*(\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}|\d{4}-\d{2}(-\d{2})?|\d{2}-\d{2}-\d{4}|q[1-4]\b|week \d+|day \d+|step \d+|level \d+|stage \d+)/i;
    const NUMERIC=/^\s*[₹+-]?\d[\d,.]*\s*(%|kg|ml|mg|g|l|days?|hrs?|hours?|mins?|minutes?|years?|months?|weeks?)?\s*$/i;
    const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
    const textOf=o=>String(o.textContent||'').replace(/\s+/g,' ').trim();
    function shouldSkip(sel,opts){
      if(sel.hasAttribute('data-keep-order')||sel.closest('[data-keep-order]'))return true;
      const body=opts.filter(o=>!TOP.test(textOf(o))&&!LAST.test(textOf(o)));
      if(body.length<3)return true;
      const t=body.map(textOf);
      const ordered=t.filter(x=>ORDERED.test(x)||TIMEISH.test(x)).length;
      if(ordered/t.length>=0.4)return true;               // months, shifts, levels, periods, times …
      return false;
    }
    function sortGroup(parent){
      const opts=[...parent.children].filter(n=>n.tagName==='OPTION');
      if(opts.length<3)return false;
      const sel=parent.tagName==='SELECT'?parent:parent.closest('select');
      if(shouldSkip(sel,opts))return false;
      const top=[],last=[],body=[];
      opts.forEach((o,i)=>{const t=textOf(o);
        if(i<2&&TOP.test(t)&&body.length===0)top.push(o);else if(LAST.test(t))last.push(o);else body.push(o);});
      const allNumeric=body.every(o=>NUMERIC.test(textOf(o)));
      body.sort((a,b)=>allNumeric?(parseFloat(textOf(a).replace(/[^\d.-]/g,''))-parseFloat(textOf(b).replace(/[^\d.-]/g,''))):collator.compare(textOf(a),textOf(b)));
      const want=[...top,...body,...last];
      if(want.every((o,i)=>opts[i]===o))return false;      // already in order
      const value=sel.value;
      const firstNonOption=[...parent.children].find(n=>n.tagName!=='OPTION')||null;
      want.forEach(o=>parent.insertBefore(o,firstNonOption));
      if(sel.value!==value)sel.value=value;                  // never change what was chosen
      return true;
    }
    function sortSelect(sel){
      try{
        if(sel.multiple&&sel.size>1&&sel.hasAttribute('data-keep-order'))return;
        sortGroup(sel);
        sel.querySelectorAll('optgroup').forEach(g=>sortGroup(g));
      }catch(_){}
    }
    const pending=new Set();let queued=false;
    const flush=()=>{queued=false;const list=[...pending];pending.clear();list.forEach(s=>{if(s.isConnected)sortSelect(s)})};
    const queue=sel=>{if(!sel)return;pending.add(sel);if(!queued){queued=true;(window.requestAnimationFrame||setTimeout)(flush)}};
    function scan(root){
      if(!root||root.nodeType!==1)return;
      if(root.tagName==='SELECT')queue(root);
      else if(root.tagName==='OPTION'||root.tagName==='OPTGROUP')queue(root.closest('select'));
      else root.querySelectorAll&&root.querySelectorAll('select').forEach(queue);
    }
    function start(){
      scan(document.body);
      try{new MutationObserver(muts=>{muts.forEach(m=>{
        if(m.type==='childList'){if(m.target.tagName==='SELECT'||m.target.tagName==='OPTGROUP')queue(m.target.closest('select'));m.addedNodes.forEach(scan)}
        else if(m.type==='characterData'){const s=m.target.parentElement&&m.target.parentElement.closest('select');if(s)queue(s)}
      })}).observe(document.body,{childList:true,subtree:true,characterData:true})}catch(_){}
      // a dropdown is also put in order the moment it is opened (covers any list that changed silently)
      document.addEventListener('pointerdown',e=>{const s=e.target&&e.target.closest&&e.target.closest('select');if(s)sortSelect(s)},true);
      document.addEventListener('focusin',e=>{if(e.target&&e.target.tagName==='SELECT')sortSelect(e.target)},true);
    }
    if(document.body)setTimeout(start,0);else document.addEventListener('DOMContentLoaded',start);
  })();
