  const ensureSmoothRefreshStyle = () => {
    if(document.getElementById('samara-smooth-refresh-style'))return;
    const style=document.createElement('style');
    style.id='samara-smooth-refresh-style';
    style.textContent=`
      html,body,#root{min-height:100%;background:#fff5fa}
      #app-splash{
        opacity:1;
        visibility:visible;
        transition:opacity .55s ease,visibility .55s ease;
        will-change:opacity;
      }
      #app-splash.splash-ready{
        opacity:0;
        visibility:hidden;
        pointer-events:none;
      }
      #app-splash .splash-card{
        transform:translateY(0) scale(1);
        transition:transform .55s cubic-bezier(.22,.61,.36,1),opacity .4s ease;
      }
      #app-splash.splash-ready .splash-card{
        transform:translateY(-8px) scale(.985);
        opacity:.96;
      }
      #app-splash .splash-progress,
      #app-splash [class*="progress"]{
        overflow:hidden;
      }
      #app-splash .splash-progress::after,
      #app-splash [class*="progress"]::after{
        content:'';
        display:block;
        height:100%;
        width:34%;
        border-radius:inherit;
        background:linear-gradient(90deg,transparent,rgba(224,58,124,.95),transparent);
        animation:samaraSplashMove 1.15s ease-in-out infinite;
      }
      @keyframes samaraSplashMove{
        0%{transform:translateX(-115%)}
        100%{transform:translateX(320%)}
      }
      @media(prefers-reduced-motion:reduce){
        #app-splash,#app-splash .splash-card,#root.samara-app-enter{
          transition:none!important;
          animation:none!important;
        }
      }
    `;
    document.head.appendChild(style);
  };

  const updateSplashStatus = text => {
    const splash=document.getElementById('app-splash');
    if(!splash)return;
    const candidates=[
      splash.querySelector('[data-splash-status]'),
      ...[...splash.querySelectorAll('p,small,span,div')].filter(node=>
        /preparing|workspace|loading|secure/i.test(String(node.textContent||''))
      )
    ].filter(Boolean);
    const node=candidates[0];
    if(node)node.textContent=text;
  };

  const finishSmoothRefresh = () => {
    const splash=document.getElementById('app-splash');
    const root=document.getElementById('root');

    updateSplashStatus('Workspace ready');

    // Reveal the fully-rendered ERP underneath the still-visible splash.
    document.documentElement.classList.remove('samara-preboot');
    document.body.classList.add('samara-app-ready');
    if(root){
      root.classList.remove('samara-app-enter');
      root.style.opacity='1';
      root.style.visibility='visible';
    }

    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        if(splash){
          splash.classList.add('splash-ready');
          setTimeout(()=>splash.remove(),420);
        }
      });
    });
  };

