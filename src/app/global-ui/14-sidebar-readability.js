  // 2.19.1: LEFT MENU readability + icons (Admin request 29-10-2026).
  // 1) Section headings sat in white text on the light-pink part of the menu and could not be read →
  //    closed headings now show dark plum text on a soft white pill; the open heading keeps its pink band.
  //    The open list of pages gets a light panel so dark text stays readable over the deep-pink lower menu.
  // 2) Headings / pages without a drawn icon showed a plain pink square → each gets a fitting icon
  //    (chosen from its name), applied only where no icon is drawn, so existing icons stay as they are.
  (function samaraSidebarReadability(){
    const svg=body=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`;
    const ICONS={
      profit:"<polyline points='22 7 13.5 15.5 8.5 10.5 2 17'/><polyline points='16 7 22 7 22 13'/>",
      expense:"<path d='M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2-3 2z'/><path d='M8 8h8M8 12h8M8 16h5'/>",
      chart:"<path d='M3 3v18h18'/><path d='M7 16v-5M12 16V8M17 16V6'/>",
      tag:"<path d='M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z'/><circle cx='7' cy='7' r='1.5'/>",
      users:"<path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8'/>",
      user:"<circle cx='12' cy='8' r='4'/><path d='M4 21v-1a7 7 0 0 1 16 0v1'/>",
      activity:"<polyline points='22 12 18 12 15 21 9 3 6 12 2 12'/>",
      wallet:"<path d='M21 12V7H5a2 2 0 0 1 0-4h14v4'/><path d='M3 5v14a2 2 0 0 0 2 2h16v-5'/><path d='M18 12a2 2 0 0 0 0 4h4v-4z'/>",
      bell:"<path d='M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'/><path d='M13.7 21a2 2 0 0 1-3.4 0'/>",
      home:"<path d='M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/><path d='M9 22V12h6v10'/>",
      box:"<path d='M21 16V8l-9-5-9 5v8l9 5 9-5z'/><path d='M3.3 7L12 12l8.7-5M12 22V12'/>",
      calendar:"<rect x='3' y='4' width='18' height='18' rx='2'/><path d='M16 2v4M8 2v4M3 10h18'/>",
      message:"<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/>",
      heart:"<path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z'/>",
      settings:"<circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 1.2 14H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6H7A1.7 1.7 0 0 0 10 1.1V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'/>",
      file:"<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><path d='M14 2v6h6M8 13h8M8 17h6'/>"
    };
    const RULES=[
      [/profit/i,'profit'],[/expense/i,'expense'],[/charge master|charge|tariff|rate/i,'tag'],
      [/statement|report|register|dashboard|log|history/i,'chart'],
      [/payment|voucher|refund|bill|ledger|account|petty|cash/i,'wallet'],
      [/physio/i,'activity'],[/my profile|employee|staff|interview|career/i,'user'],
      [/patient|guest|admission|family|enquir/i,'users'],[/notification|alert|escalation/i,'bell'],
      [/stock|store|pharmacy|consumable|vendor|kitchen|housekeeping|equipment|oxygen/i,'box'],
      [/duty|leave|calendar|shift|roster/i,'calendar'],[/whatsapp|mail|talk|feedback|message|communication/i,'message'],
      [/nursing|care|vital|medicine|clinical|intake|incident|medication|special nurse/i,'heart'],
      [/overview|home/i,'home'],[/admin|setting|maintenance|health|audit|master|form field/i,'settings']
    ];
    const iconFor=name=>{const n=String(name||'');const r=RULES.find(([re])=>re.test(n));return r?r[1]:'file'};
    const css=`
      html body .sidebar .nav-section:not(.expanded)>.nav-heading-button{background:rgba(255,255,255,.86)!important;color:#6b0f3c!important;text-shadow:none!important;border-radius:12px!important;margin:3px 0!important;box-shadow:0 2px 6px rgba(107,15,60,.08)!important}
      html body .sidebar .nav-section:not(.expanded)>.nav-heading-button *{color:#6b0f3c!important;text-shadow:none!important}
      html body .sidebar .nav-section:not(.expanded)>.nav-heading-button .nav-chevron{background:#f6dce8!important;color:#8a124f!important}
      html body .sidebar .nav-section.expanded .nav-submenu{background:rgba(255,255,255,.93)!important;border-radius:14px!important;box-shadow:0 4px 12px rgba(107,15,60,.10)!important}
      html body .sidebar .nav-section.expanded .nav-submenu button:not(.active){color:#3f1a2c!important;text-shadow:none!important}
      html body .sidebar .nav-section.expanded .nav-submenu button:not(.active) *{color:#3f1a2c!important}
      ${Object.entries(ICONS).map(([k,b])=>`html body .sidebar button[data-icon-fix="${k}"]::before{content:''!important;-webkit-mask-image:${svg(b)}!important;mask-image:${svg(b)}!important;-webkit-mask-repeat:no-repeat!important;mask-repeat:no-repeat!important;-webkit-mask-position:center!important;mask-position:center!important;-webkit-mask-size:contain!important;mask-size:contain!important;background-image:none!important}`).join('\n')}
    `;
    function addStyle(){
      if(document.getElementById('samara-sidebar-readability'))return;
      const st=document.createElement('style');st.id='samara-sidebar-readability';st.textContent=css;document.head.appendChild(st);
    }
    // a "pink square" = a ::before with a background colour but no icon drawn (no mask, no text, no image)
    const isPlainBox=b=>{try{const cs=getComputedStyle(b,'::before');
      if(cs.content==='none'||cs.content==='normal')return false;
      const blank=cs.content==='""'||cs.content==="''";const mask=(cs.webkitMaskImage||cs.maskImage||'none');
      return blank&&mask==='none'&&(!cs.backgroundImage||cs.backgroundImage==='none')&&cs.backgroundColor!=='rgba(0, 0, 0, 0)';}catch(_){return false}};
    let queued=false;
    function fixIcons(){
      queued=false;
      document.querySelectorAll('.sidebar button[data-nav],.sidebar button[data-section]').forEach(b=>{
        if(b.dataset.iconFix){return}
        if(isPlainBox(b))b.dataset.iconFix=iconFor(b.dataset.nav||b.dataset.section||b.textContent);
      });
    }
    const queue=()=>{if(!queued){queued=true;window.requestAnimationFrame(fixIcons)}};
    function start(){
      addStyle();queue();
      try{new MutationObserver(queue).observe(document.body,{childList:true,subtree:true})}catch(_){}
    }
    if(document.body)setTimeout(start,0);else document.addEventListener('DOMContentLoaded',start);
  })();
