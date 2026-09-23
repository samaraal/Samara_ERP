  // v2.11.36: Global Tamil / English voice input added to frontline nursing narrative fields (handover, remarks, notes, instructions, observations and similar manual entries).
  // v2.11.37: Nursing voice records until Stop and requires editable review before insertion.
  // v2.11.39: Gemini primary voice conversion with automatic/manual OpenAI fallback.
  // v2.11.35: Patient File Medicines simplified into compact tables for current prescription, modification history, doctor review and today's MAR.
  // v2.11.34: Patient File Medicines now shows full prescription/version/review history and today's MAR only.
  // v2.11.27: nurses/caregivers use priority cards on mobile and the full medication register on desktop.
  // v2.11.26: medication doctor-review revisions preserve prescription history and effective-time MAR safety.
  // v2.11.25: keep a bottom Close action available for long ERP pop-up windows.
  // A single body-level helper avoids changing the internal structure of every modal.
  function installGlobalModalBottomClose(){
    if(document.getElementById('samara-global-modal-close'))return;
    const button=document.createElement('button');
    button.id='samara-global-modal-close';
    button.type='button';
    button.className='btn btn-secondary samara-global-modal-close';
    button.textContent='Close';
    button.setAttribute('aria-label','Close current pop-up window');
    button.hidden=true;
    document.body.appendChild(button);
    const visible=el=>!!(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    const refresh=()=>{
      const modals=[...document.querySelectorAll('.modal-backdrop .modal')].filter(visible);
      const modal=modals[modals.length-1];
      const close=modal?.querySelector('.close');
      const hasBottomActions=!!modal?.querySelector('.modal-bottom-actions');
      const shouldHide=!modal||!close||hasBottomActions||modal.classList.contains('duty-assignment-modal');
      if(button.hidden!==shouldHide) button.hidden=shouldHide;
    };
    button.addEventListener('click',()=>{
      const modals=[...document.querySelectorAll('.modal-backdrop .modal')].filter(visible);
      const modal=modals[modals.length-1];
      modal?.querySelector('.close')?.click();
      setTimeout(refresh,0);
    });
    // React mounts/unmounts pop-ups in the DOM. Watching child-list changes is enough
    // and, importantly, avoids an observer feedback loop on the helper's own hidden attribute.
    new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',refresh,{passive:true});
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installGlobalModalBottomClose,{once:true});
  else installGlobalModalBottomClose();

  // v2.11.61: every desktop ERP pop-up can be moved by dragging its header.
  // Event delegation covers existing and future React-rendered pop-ups without
  // adding drag code to each individual form.
  function installGlobalDraggablePopups(){
    if(document.documentElement.dataset.samaraPopupDrag==='ready')return;
    document.documentElement.dataset.samaraPopupDrag='ready';
    const backdropSelector='.modal-backdrop,.samara-voice-modal-backdrop';
    const headerSelector='.panel-head,.modal-head,.patient-master-header,.samara-voice-modal-head';
    const interactiveSelector='button,input,select,textarea,a,label,[contenteditable="true"],[role="button"]';

    document.addEventListener('pointerdown',event=>{
      if(event.button!==0||window.matchMedia('(max-width: 760px)').matches)return;
      if(!(event.target instanceof Element)||event.target.closest(interactiveSelector))return;
      const backdrop=event.target.closest(backdropSelector);
      if(!backdrop)return;

      let popup=event.target;
      while(popup.parentElement&&popup.parentElement!==backdrop)popup=popup.parentElement;
      if(popup.parentElement!==backdrop||popup.style.position==='static')return;

      const rect=popup.getBoundingClientRect();
      const namedHeader=event.target.closest(headerSelector);
      const isHeaderDrag=!!(namedHeader&&popup.contains(namedHeader));
      // A few specialised pop-ups use their own header class. Their uncluttered
      // top title band is also a safe drag handle.
      if(!isHeaderDrag&&event.clientY>rect.top+96)return;
      const dragHandle=isHeaderDrag?namedHeader:popup;
      const startX=event.clientX;
      const startY=event.clientY;
      const oldX=Number(popup.dataset.samaraDragX||0);
      const oldY=Number(popup.dataset.samaraDragY||0);
      const minDx=24-rect.left;
      const maxDx=window.innerWidth-24-rect.right;
      const minDy=12-rect.top;
      const maxDy=window.innerHeight-48-rect.top;
      popup.classList.add('samara-draggable-popup','samara-popup-dragging');
      dragHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();

      const move=moveEvent=>{
        const dx=Math.max(minDx,Math.min(maxDx,moveEvent.clientX-startX));
        const dy=Math.max(minDy,Math.min(maxDy,moveEvent.clientY-startY));
        const nextX=oldX+dx;
        const nextY=oldY+dy;
        popup.dataset.samaraDragX=String(nextX);
        popup.dataset.samaraDragY=String(nextY);
        popup.style.translate=`${nextX}px ${nextY}px`;
      };
      const stop=()=>{
        popup.classList.remove('samara-popup-dragging');
        window.removeEventListener('pointermove',move);
        window.removeEventListener('pointerup',stop);
        window.removeEventListener('pointercancel',stop);
      };
      window.addEventListener('pointermove',move,{passive:true});
      window.addEventListener('pointerup',stop,{once:true});
      window.addEventListener('pointercancel',stop,{once:true});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installGlobalDraggablePopups,{once:true});
  else installGlobalDraggablePopups();

  // v2.10.05 PWA self-service recovery. Available on the login page and after login.
  function samaraReloadApp(){
    const url=new URL(window.location.href);
    url.searchParams.set('samara_refresh',APP_VERSION);
    url.searchParams.set('_',Date.now());
    window.location.replace(url.toString());
  }
  async function samaraRepairApp(button){
    if(!window.confirm('Repair Samara Care app files and reload?\n\nThis clears only the Samara app cache/service worker. Patient, clinical, billing and other Supabase data will not be changed.'))return;
    if(typeof window.SAMARA_REPAIR_APP==='function')return window.SAMARA_REPAIR_APP(button);
    try{
      if(button){button.disabled=true;button.textContent='Repairing…'}
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(regs.map(reg=>reg.unregister()));
      }
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.allSettled(keys.filter(key=>key.startsWith('samara-erp-')).map(key=>caches.delete(key)));
      }
      samaraReloadApp();
    }catch(error){
      if(button){button.disabled=false;button.textContent='Repair App'}
      alert(`Repair could not finish automatically. Please close Samara Care and open it again.\n\n${error?.message||error}`);
    }
  }
  async function samaraManualUpdateCheck(button){
    const original=button?.textContent||'Check for Updates';
    try{
      if(button){button.disabled=true;button.textContent='Checking…'}
      if('serviceWorker' in navigator){
        try{const reg=await navigator.serviceWorker.getRegistration();await reg?.update()}catch(_error){}
      }
      if(typeof window.samaraCheckForUpdate==='function'){
        const found=await window.samaraCheckForUpdate();
        if(found)return true;
      }
      alert(`Samara Care ERP ${APP_VERSION} is up to date.`);
      return false;
    }finally{
      if(button&&document.body.contains(button)){button.disabled=false;button.textContent=original}
    }
  }
  function samaraOpenAppHelp(){
    document.getElementById('samara-app-help-overlay')?.remove();
    const overlay=document.createElement('div');
    overlay.id='samara-app-help-overlay';
    Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'1000000',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',background:'rgba(42,13,31,.48)',backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)'});
    const card=document.createElement('div');
    Object.assign(card.style,{width:'min(430px,calc(100vw - 32px))',maxHeight:'90dvh',overflow:'auto',background:'#fff',borderRadius:'22px',padding:'22px',boxShadow:'0 18px 55px rgba(74,0,39,.28)',color:'#351927'});
    card.innerHTML=`<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px"><div><div style="font-size:12px;font-weight:900;letter-spacing:.13em;color:#087667">APP HELP</div><h2 style="margin:5px 0 3px;font-size:24px;color:#5d1039">Samara Care</h2><div style="font-size:14px;color:#78636f">ERP Version ${APP_VERSION}</div></div><button type="button" id="samara-help-close" aria-label="Close" style="width:42px;height:42px;border:0;border-radius:50%;background:#f8edf2;color:#5d1039;font-size:24px">×</button></div><p style="margin:10px 0 16px;line-height:1.5;color:#5d4b55">Use these options if the app does not refresh correctly after an update.</p><div style="display:grid;gap:10px"><button type="button" id="samara-help-update" style="min-height:50px;border:0;border-radius:13px;background:#087667;color:#fff;font-size:16px;font-weight:800">Check for Updates</button><button type="button" id="samara-help-reload" style="min-height:50px;border:1px solid #d8c3cf;border-radius:13px;background:#fff;color:#7a1247;font-size:16px;font-weight:800">Reload App</button><button type="button" id="samara-help-repair" style="min-height:50px;border:1px solid #e8b6cc;border-radius:13px;background:#fff5f9;color:#a30f5a;font-size:16px;font-weight:800">Repair App</button></div><p style="margin:14px 0 0;font-size:12.5px;line-height:1.45;color:#7c6a74">Repair App resets only Samara's cached application files and service worker. It does not delete Supabase patient, clinical or billing data.</p>`;
    overlay.appendChild(card);document.body.appendChild(overlay);
    const close=()=>overlay.remove();
    overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
    card.querySelector('#samara-help-close')?.addEventListener('click',close);
    card.querySelector('#samara-help-update')?.addEventListener('click',e=>samaraManualUpdateCheck(e.currentTarget));
    card.querySelector('#samara-help-reload')?.addEventListener('click',samaraReloadApp);
    card.querySelector('#samara-help-repair')?.addEventListener('click',e=>samaraRepairApp(e.currentTarget));
  }
  window.SAMARA_OPEN_APP_HELP=samaraOpenAppHelp;
  window.SAMARA_RELOAD_APP=samaraReloadApp;

  // v2.9.47: Mobile/PWA clinical alerts use OS push notifications only.
  // Samara's custom tone + Tamil speech remain desktop/laptop features.
  function isMobileClinicalDevice(){
    try{
      const coarse=window.matchMedia?.('(pointer: coarse)')?.matches;
      const noHover=window.matchMedia?.('(hover: none)')?.matches;
      const narrow=window.matchMedia?.('(max-width: 900px)')?.matches;
      const mobileUA=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'');
      return Boolean(mobileUA||(coarse&&noHover&&narrow));
    }catch(_){return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||'')}
  }
  function base64UrlToUint8Array(value){
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);
    return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
  }
  async function showSystemNotification(title,options={}){
    if(!('Notification' in window)||Notification.permission!=='granted')return false;
    try{
      if('serviceWorker' in navigator){
        const registration=await navigator.serviceWorker.ready;
        await registration.showNotification(title,options);
        return true;
      }
      new Notification(title,options);
      return true;
    }catch(error){console.warn('System notification unavailable:',error);return false}
  }
