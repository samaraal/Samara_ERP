  // 2.18.191: Samara in-app dialog in place of the browser's own prompt() / confirm() box.
  // The browser box always opens at the very top of the screen, far from the button pressed, and cannot be
  // styled. samaraAsk() opens a baby-pink Samara box right next to the button that was pressed (anchor),
  // and returns a Promise: the typed values ({key: value}) on OK, or null on Cancel / Esc / tap outside.
  //   await samaraAsk({anchor, title, message, fields:[{key,label,value,type,placeholder,required}], okLabel})
  //   await samaraConfirm({anchor, title, message, okLabel})   -> true / false
  function samaraEnsureAskStyle(){
    if(document.getElementById('samara-ask-style'))return;
    const style=document.createElement('style');style.id='samara-ask-style';
    style.textContent=`
      .samara-ask-backdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(43,6,25,.18);animation:samaraAskFade .15s ease-out both}
      .samara-ask-box{position:fixed;z-index:2147483601;width:min(420px,calc(100vw - 20px));box-sizing:border-box;
        background:linear-gradient(135deg,#fcdde9 0%,#feecf3 55%,#fff8fb 100%);color:#3b0f25;border:2px solid #e9a9c4;
        border-radius:18px;box-shadow:0 18px 48px rgba(160,21,79,.30);padding:16px 18px 14px;
        font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;animation:samaraAskPop .18s cubic-bezier(.2,1.2,.4,1) both}
      .samara-ask-box h3{margin:0 0 6px;font-size:17px;font-weight:900;color:#a80d4f}
      .samara-ask-box .samara-ask-msg{margin:0 0 10px;font-size:14px;line-height:1.45;font-weight:600;white-space:pre-line;color:#4d2238}
      .samara-ask-box label{display:block;margin:8px 0 4px;font-size:13px;font-weight:800;color:#8a3a62}
      .samara-ask-box input,.samara-ask-box textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #e9a9c4;border-radius:12px;
        background:#fff;color:#2b0f1e;font-size:15px;font-weight:700;font-family:inherit;outline:none}
      .samara-ask-box textarea{min-height:64px;resize:vertical}
      .samara-ask-box input:focus,.samara-ask-box textarea:focus{border-color:#c2185b;box-shadow:0 0 0 3px rgba(214,51,138,.18)}
      .samara-ask-box .samara-ask-err{min-height:16px;margin:6px 0 0;font-size:12.5px;font-weight:800;color:#c0123c}
      .samara-ask-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}
      .samara-ask-actions button{min-height:42px;min-width:92px;padding:8px 16px;border-radius:12px;font-size:15px;font-weight:900;cursor:pointer;font-family:inherit}
      .samara-ask-ok{border:0;color:#fff;background:linear-gradient(135deg,#a80d4f,#d6338a);box-shadow:0 6px 16px rgba(168,13,79,.28)}
      .samara-ask-cancel{border:1.5px solid #e9a9c4;background:#fff;color:#8a1c52}
      @keyframes samaraAskFade{from{opacity:0}to{opacity:1}}
      @keyframes samaraAskPop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
      @media(max-width:600px){.samara-ask-box{left:10px!important;right:10px!important;width:auto}}
    `;document.head.appendChild(style);
  }
  // place the box just below (or above, if no room) the button that was pressed; centred if there is no anchor
  function samaraPlaceAskBox(box,anchor){
    const vw=window.innerWidth,vh=window.innerHeight,bw=box.offsetWidth,bh=box.offsetHeight,gap=10;
    const r=anchor&&anchor.isConnected&&anchor.getBoundingClientRect?anchor.getBoundingClientRect():null;
    if(!r||(!r.width&&!r.height)){box.style.left=Math.max(10,(vw-bw)/2)+'px';box.style.top=Math.max(10,(vh-bh)/2)+'px';return}
    let top=r.bottom+gap;
    if(top+bh>vh-10)top=r.top-bh-gap;           // not enough room below → open above the button
    if(top<10)top=Math.max(10,(vh-bh)/2);       // neither fits → centre
    let left=r.left;
    if(left+bw>vw-10)left=vw-bw-10;
    box.style.left=Math.max(10,left)+'px';box.style.top=top+'px';
  }
  function samaraAsk({anchor=null,title='',message='',fields=[],okLabel='OK',cancelLabel='Cancel'}={}){
    return new Promise(resolve=>{
      samaraEnsureAskStyle();
      const pressed=anchor||(document.activeElement&&document.activeElement!==document.body?document.activeElement:null);
      const backdrop=document.createElement('div');backdrop.className='samara-ask-backdrop';
      const box=document.createElement('div');box.className='samara-ask-box';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
      if(title){const h3=document.createElement('h3');h3.textContent=title;box.appendChild(h3)}
      if(message){const p=document.createElement('p');p.className='samara-ask-msg';p.textContent=message;box.appendChild(p)}
      const inputs=fields.map((f,i)=>{
        const id=`samara-ask-${Date.now()}-${i}`;
        if(f.label){const l=document.createElement('label');l.htmlFor=id;l.textContent=f.label;box.appendChild(l)}
        const el=document.createElement(f.type==='textarea'?'textarea':'input');el.id=id;
        if(f.type!=='textarea'){el.type=f.type==='number'?'text':'text';if(f.type==='number')el.inputMode='decimal'}
        el.value=f.value==null?'':String(f.value);if(f.placeholder)el.placeholder=f.placeholder;
        box.appendChild(el);return el;
      });
      const err=document.createElement('p');err.className='samara-ask-err';if(fields.length)box.appendChild(err);
      const actions=document.createElement('div');actions.className='samara-ask-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='samara-ask-cancel';cancel.textContent=cancelLabel;
      const ok=document.createElement('button');ok.type='button';ok.className='samara-ask-ok';ok.textContent=okLabel;
      actions.append(cancel,ok);box.appendChild(actions);
      document.body.append(backdrop,box);
      samaraPlaceAskBox(box,pressed);
      const done=value=>{document.removeEventListener('keydown',onKey,true);backdrop.remove();box.remove();try{pressed&&pressed.focus&&pressed.focus({preventScroll:true})}catch(_){}resolve(value)};
      const submit=()=>{
        const values={};
        for(let i=0;i<fields.length;i++){
          const v=String(inputs[i].value||'').trim(),f=fields[i];
          if(f.required&&!v){err.textContent=`Please enter ${String(f.label||'a value').toLowerCase()}.`;inputs[i].focus();return}
          values[f.key||String(i)]=v;
        }
        done(fields.length?values:true);
      };
      const onKey=e=>{
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(null)}
        else if(e.key==='Enter'&&!(e.target&&e.target.tagName==='TEXTAREA')&&box.contains(e.target)){e.preventDefault();submit()}
      };
      document.addEventListener('keydown',onKey,true);
      ok.addEventListener('click',submit);cancel.addEventListener('click',()=>done(null));backdrop.addEventListener('click',()=>done(null));
      setTimeout(()=>{const first=inputs[0];if(first){first.focus();try{first.select()}catch(_){}}else ok.focus()},30);
    });
  }
  async function samaraConfirm(opts={}){return (await samaraAsk({...opts,fields:[]}))===true}

