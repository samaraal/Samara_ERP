  const finishSuccessfulAction = ({
    close,
    returnPage,
    onNavigate,
    delay=650,
    refresh
  }={}) => {
    try{
      if(typeof close==='function')close();
    }catch(error){
      console.warn('Action window could not be closed cleanly.',error);
    }
    try{
      if(typeof refresh==='function')refresh();
    }catch(error){
      console.warn('Previous display refresh could not be started.',error);
    }
    if(returnPage&&typeof onNavigate==='function'){
      setTimeout(()=>onNavigate(returnPage),delay);
      return true;
    }
    return false;
  };

  const returnAfterSuccessfulAction = (returnPage,onNavigate,delay=650) =>
    finishSuccessfulAction({returnPage,onNavigate,delay});


  const closeTopActionPopup = () => {
    const popups=[...document.querySelectorAll('.modal-backdrop')]
      .filter(node=>{
        const style=window.getComputedStyle(node);
        return style.display!=='none'&&
          style.visibility!=='hidden'&&
          node.getAttribute('data-manual-close')!=='true';
      });
    const popup=popups.at(-1);
    if(!popup)return false;

    const closeButton=
      popup.querySelector('button.close')||
      [...popup.querySelectorAll('button')].find(button=>
        ['close','cancel','done','back'].includes(
          String(button.textContent||'').trim().toLowerCase()
        )
      );

    if(closeButton){
      closeButton.click();
      return true;
    }

    popup.dispatchEvent(new KeyboardEvent('keydown',{
      key:'Escape',
      code:'Escape',
      bubbles:true
    }));
    return true;
  };

  const isSuccessfulEntryElement = node => {
    if(!(node instanceof Element))return false;
    if(node.matches('.samara-toast.success,.samara-toast.warning,.message.success,.toast.success,.toast.warning,[data-toast-type="success"],[data-toast-type="warning"]'))return true;
    return Boolean(node.querySelector('.samara-toast.success,.samara-toast.warning,.message.success,.toast.success,.toast.warning,[data-toast-type="success"],[data-toast-type="warning"]'));
  };



  const showSamaraActionToast = (type='success',title='',text='') => {
    try{
      document.querySelectorAll('.samara-save-confirmation').forEach(node=>node.remove());

      const warning=type==='warning'||(type==='success'&&/saved with warning|saved for review|warning/i.test(String(text)));
      const success=type==='success'&&!warning;
      const tone=success?'success':warning?'warning':'error';
      const overlay=document.createElement('div');
      overlay.className=`samara-save-confirmation ${tone}`;
      overlay.setAttribute('role',success?'status':'alert');
      overlay.setAttribute('aria-live',success?'polite':'assertive');

      // INLINE layout is deliberate: confirmation must remain visible even if
      // an old stylesheet, browser cache or React re-render is present.
      Object.assign(overlay.style,{
        position:'fixed',
        left:'0',right:'0',top:'0',
        zIndex:'2147483647',
        display:'flex',
        justifyContent:'center',
        alignItems:'flex-start',
        padding:'max(12px, env(safe-area-inset-top)) 10px 10px',
        pointerEvents:'none'
      });

      const card=document.createElement('div');
      Object.assign(card.style,{
        width:'min(560px, calc(100vw - 20px))',
        boxSizing:'border-box',
        display:'grid',
        gridTemplateColumns:'46px minmax(0,1fr) 54px',
        alignItems:'center',
        gap:'11px',
        minHeight:'92px',
        padding:'14px',
        borderRadius:'17px',
        background:success
          ?'linear-gradient(110deg,#087f5b,#0b9b73,#17b978)'
          :warning
            ?'linear-gradient(110deg,#9a5b00,#c47b00,#e0a51b)'
            :'linear-gradient(110deg,#a7192b,#c9293c,#df4050)',
        color:'#ffffff',
        border:'2px solid rgba(255,255,255,.50)',
        boxShadow:'0 18px 48px rgba(0,0,0,.30)',
        pointerEvents:'auto',
        fontFamily:"Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
      });

      const icon=document.createElement('div');
      icon.textContent=success?'✓':'!';
      Object.assign(icon.style,{
        width:'44px',height:'44px',
        display:'flex',alignItems:'center',justifyContent:'center',
        borderRadius:'50%',
        background:'rgba(255,255,255,.20)',
        color:'#fff',
        fontSize:'27px',
        fontWeight:'900'
      });

      const copy=document.createElement('div');
      Object.assign(copy.style,{display:'grid',gap:'4px',minWidth:'0'});
      const strong=document.createElement('strong');
      strong.textContent=title||(success?'Success':warning?'Saved with warning':'Action failed');
      Object.assign(strong.style,{color:'#fff',fontSize:'17px',lineHeight:'1.15',fontWeight:'900'});
      const span=document.createElement('span');
      span.textContent=text||(success?'Your entry has been saved successfully.':warning?'The entry was saved and requires review.':'Please check the entry and try again.');
      Object.assign(span.style,{color:'#fff',fontSize:'13px',lineHeight:'1.35',fontWeight:'600'});
      copy.append(strong,span);

      const ok=document.createElement('button');
      ok.type='button';
      ok.textContent='OK';
      Object.assign(ok.style,{
        minWidth:'50px',minHeight:'42px',
        padding:'7px 9px',
        border:'1px solid rgba(255,255,255,.60)',
        borderRadius:'11px',
        background:'rgba(255,255,255,.16)',
        color:'#fff',
        fontSize:'14px',
        fontWeight:'900',
        cursor:'pointer'
      });
      ok.addEventListener('click',()=>overlay.remove());

      card.append(icon,copy,ok);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      try{
        if(navigator.vibrate)navigator.vibrate(success?[80]:[100,60,100]);
      }catch(_){}

      // Staff must have time to notice it. They may dismiss immediately with OK.
      window.setTimeout(()=>{if(overlay.isConnected)overlay.remove();},10000);
    }catch(error){
      console.error('Save confirmation display failed:',error);
      // Last-resort feedback if the DOM notification itself cannot be built.
      try{window.alert(`${title||'Samara Care ERP'}\n${text||''}`)}catch(_){}
    }
  };

  const setGlobalActionFailure = (title,text) => {
    showSamaraActionToast('error',title||'Unable to save',text||'Please check the entry and try again.');
  };

  const ensureGlobalActionSuccessStyle = () => {
    if(document.getElementById('samara-global-action-success-style'))return;
    const style=document.createElement('style');
    style.id='samara-global-action-success-style';
    style.textContent=`
      .samara-toast.success,
      .toast.success,
      [data-toast-type="success"] {
        position: fixed !important;
        top: 46px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 30000 !important;
        display: grid !important;
        grid-template-columns: 42px minmax(0,1fr) 28px !important;
        align-items: center !important;
        gap: 12px !important;
        min-width: min(680px, calc(100vw - 28px)) !important;
        max-width: 820px !important;
        padding: 18px 20px !important;
        border: 0 !important;
        border-radius: 13px !important;
        background: linear-gradient(105deg,#087f5b,#0b9b73,#17b978) !important;
        color: #ffffff !important;
        box-shadow: 0 14px 34px rgba(122,18,71,.28) !important;
        font-weight: 700 !important;
      }

      .samara-toast.success .samara-toast-icon,
      .toast.success .samara-toast-icon,
      [data-toast-type="success"] .samara-toast-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 46px !important;
        height: 46px !important;
        border-radius: 50% !important;
        background: rgba(255,255,255,.18) !important;
        color: #ffffff !important;
        font-size: 28px !important;
        font-weight: 900 !important;
      }

      .samara-toast.success > div,
      .toast.success > div,
      [data-toast-type="success"] > div {
        min-width: 0 !important;
        display: grid !important;
        gap: 3px !important;
      }

      .samara-toast.success strong,
      .toast.success strong,
      [data-toast-type="success"] strong {
        color: #ffffff !important;
        font-size: 19px !important;
        line-height: 1.25 !important;
        font-weight: 800 !important;
      }

      .samara-toast.success span,
      .toast.success span,
      [data-toast-type="success"] span {
        color: #ffffff !important;
      }

      .samara-toast.success > div > span,
      .toast.success > div > span,
      [data-toast-type="success"] > div > span {
        font-size: 15px !important;
        line-height: 1.45 !important;
        font-weight: 600 !important;
        opacity: .96 !important;
      }

      .samara-toast.success button,
      .toast.success button,
      [data-toast-type="success"] button {
        width: 28px !important;
        height: 28px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 50% !important;
        background: transparent !important;
        color: #ffffff !important;
        font-size: 21px !important;
        font-weight: 800 !important;
        cursor: pointer !important;
      }

      .samara-toast.success button:hover,
      .toast.success button:hover,
      [data-toast-type="success"] button:hover {
        background: rgba(255,255,255,.13) !important;
      }

      .samara-toast.error,
      .toast.error,
      [data-toast-type="error"] {
        position: fixed !important;
        top: 46px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 50000 !important;
        display: grid !important;
        grid-template-columns: 42px minmax(0,1fr) 28px !important;
        align-items: center !important;
        gap: 12px !important;
        min-width: min(525px, calc(100vw - 28px)) !important;
        max-width: 680px !important;
        padding: 14px 16px !important;
        border: 0 !important;
        border-radius: 13px !important;
        background: linear-gradient(105deg,#a51f2d,#c92d3d,#df4050) !important;
        color: #ffffff !important;
        box-shadow: 0 14px 34px rgba(145,23,39,.28) !important;
        font-weight: 700 !important;
      }
      .samara-toast.error .samara-toast-icon,
      .toast.error .samara-toast-icon,
      [data-toast-type="error"] .samara-toast-icon{
        display:inline-flex!important;
        align-items:center!important;
        justify-content:center!important;
        width:38px!important;
        height:38px!important;
        border-radius:50%!important;
        background:rgba(255,255,255,.18)!important;
        color:#fff!important;
        font-size:24px!important;
        font-weight:900!important;
      }
      .samara-toast.error > div,
      .toast.error > div,
      [data-toast-type="error"] > div{
        min-width:0!important;
        display:grid!important;
        gap:3px!important;
      }
      .samara-toast.error strong,
      .samara-toast.error span,
      .toast.error strong,
      .toast.error span,
      [data-toast-type="error"] strong,
      [data-toast-type="error"] span{color:#fff!important}
      .samara-toast.error button,
      .toast.error button,
      [data-toast-type="error"] button{
        width:28px!important;height:28px!important;padding:0!important;border:0!important;
        border-radius:50%!important;background:transparent!important;color:#fff!important;
        font-size:21px!important;font-weight:800!important;
      }
      .samara-toast.warning,
      .toast.warning,
      [data-toast-type="warning"] {
        position: fixed !important;
        top: 46px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 45000 !important;
        display: grid !important;
        grid-template-columns: 42px minmax(0,1fr) 28px !important;
        align-items: center !important;
        gap: 12px !important;
        min-width: min(680px, calc(100vw - 28px)) !important;
        max-width: 820px !important;
        padding: 18px 20px !important;
        border: 0 !important;
        border-radius: 13px !important;
        background: linear-gradient(105deg,#9a5b00,#c47b00,#e0a51b) !important;
        color: #ffffff !important;
        box-shadow: 0 14px 34px rgba(154,91,0,.28) !important;
        font-weight: 700 !important;
      }
      .samara-toast.warning strong,
      .samara-toast.warning span,
      .toast.warning strong,
      .toast.warning span,
      [data-toast-type="warning"] strong,
      [data-toast-type="warning"] span{color:#fff!important}
      .samara-toast.warning .samara-toast-icon,
      .toast.warning .samara-toast-icon,
      [data-toast-type="warning"] .samara-toast-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:46px!important;height:46px!important;border-radius:50%!important;background:rgba(255,255,255,.18)!important;color:#fff!important;font-size:28px!important;font-weight:900!important}
      @media(max-width:650px){
        .samara-toast.success,.samara-toast.warning,.samara-toast.error,
        .toast.success,.toast.warning,.toast.error,
        [data-toast-type="success"],[data-toast-type="warning"],[data-toast-type="error"]{
          top:calc(10px + env(safe-area-inset-top))!important;
          left:10px!important;
          right:10px!important;
          transform:none!important;
          min-width:0!important;
          width:auto!important;
          max-width:none!important;
          grid-template-columns:36px minmax(0,1fr) 26px!important;
          padding:12px 13px!important;
          border-radius:15px!important;
        }
      }

      .message.success {
        border: 1px solid #e4afc8 !important;
        background: #fff0f6 !important;
        color: #7a1247 !important;
        font-weight: 700 !important;
      }

      @media (max-width: 650px) {
        .samara-toast.success,
        .toast.success,
        [data-toast-type="success"] {
          top: 18px !important;
          grid-template-columns: 38px minmax(0,1fr) 26px !important;
          min-width: calc(100vw - 22px) !important;
          padding: 12px 13px !important;
        }
      }
    `;
    document.head.appendChild(style);
  };


