  // 2.18.180: step-by-step Back. A page with sections / drill-downs registers a handler that goes back ONE level
  // (e.g. pay sheet → employee list → Expenses boxes) and returns true; it returns false when already at its first
  // view. The top "‹ Back", the floating Back and the phone back button ask these handlers first (newest first),
  // and only change page when none of them went back.
  window.__samaraStepBackers=window.__samaraStepBackers||[];
  window.__samaraStepBack=function(){
    const list=window.__samaraStepBackers;
    for(let i=list.length-1;i>=0;i--){try{if(list[i].current&&list[i].current())return true}catch(_){}}
    return false;
  };
  function useStepBack(handler){
    const ref=React.useRef(handler);ref.current=handler;
    React.useEffect(()=>{const list=window.__samaraStepBackers;list.push(ref);return()=>{const i=list.indexOf(ref);if(i>=0)list.splice(i,1)}},[]);
    return ()=>{if(!window.__samaraStepBack())return false;window.requestAnimationFrame(()=>{try{window.scrollTo({top:0,left:0})}catch(_){}});return true};
  }
