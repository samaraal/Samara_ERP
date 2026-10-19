  // 2.18.7: Nurse idle screensaver — after 3 minutes without activity a Nurse login shows the
  // upcoming tasks of the current shift in Samara pink boxes (Medication / Nursing Procedure / Care).
  // READ ONLY: it reads the same tables as Shift Tasks and never saves anything. The first touch / key
  // only closes it (it never presses a button underneath). The 30-minute idle sign-out is unchanged.
  // Guests are shown by Room + full name (2.18.8); medicines
  // as a count (the name only for sliding-scale insulin, which needs a sugar check first).
  const NURSE_SAVER_IDLE_MS=90*1000; // 2.18.12: 90 seconds (was 3 minutes)
  const NURSE_SAVER_HORIZON_MS=4*60*60*1000;
  const NURSE_SAVER_FLIP_SEC=4;

  function ensureNurseSaverStyles(){
    if(document.getElementById('samara-nurse-saver-css'))return;
    const s=document.createElement('style');
    s.id='samara-nurse-saver-css';
    s.textContent=`
.nss-overlay{position:fixed;inset:0;z-index:2147482500;background:#fff3f8;color:#382333;cursor:pointer;overflow:hidden;font-family:inherit;-webkit-tap-highlight-color:transparent}
.nss-inner{box-sizing:border-box;height:100%;max-width:1760px;margin:0 auto;padding:clamp(14px,3vw,32px) clamp(14px,3.2vw,40px) clamp(12px,2.4vw,26px);display:flex;flex-direction:column;gap:clamp(12px,2vw,20px);animation:nssDrift 240s ease-in-out infinite}
.nss-head{display:flex;align-items:center;justify-content:space-between;gap:18px}
.nss-brand{display:flex;align-items:center;gap:clamp(12px,2.4vw,28px)}
.nss-logo{background:#fff;border:1px solid #ead0de;border-radius:18px;padding:6px 12px;display:flex}
.nss-logo img{height:clamp(46px,7vw,78px);width:auto;display:block}
.nss-clock{font-family:Georgia,'Times New Roman',serif;font-weight:900;font-size:clamp(38px,6vw,66px);line-height:1;color:#5d1039}
.nss-sec{font-size:.55em;color:#b01264;font-variant-numeric:tabular-nums;margin-left:2px}
.nss-clock small{font-family:inherit;font-size:.38em;font-weight:700;color:#7a1247;margin-left:8px}
.nss-colon{animation:nssColon 2s steps(1) infinite}
.nss-date{font-size:clamp(13px,1.6vw,18px);font-weight:600;color:#67143f;margin-top:4px}
.nss-shift{display:flex;flex-direction:column;align-items:flex-end;gap:8px;text-align:right}
.nss-chip{background:#5d1039;color:#fff;border-radius:999px;padding:7px 16px;font-size:clamp(13px,1.5vw,17px);font-weight:700}
.nss-onduty{font-size:clamp(13px,1.5vw,17px)}
.nss-overdue{background:#fde2dc;border:2px solid #f36a4c;border-radius:18px;padding:12px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;animation:nssBorder 2.4s ease-in-out infinite}
.nss-overdue-tag{background:#b3341a;color:#fff;border-radius:10px;padding:5px 12px;font-size:15px;font-weight:800;letter-spacing:.04em}
.nss-overdue-text{font-size:clamp(15px,1.7vw,19px);color:#5a1a0c}
.nss-overdue-more{margin-left:auto;font-size:15px;color:#7a2a14;font-weight:600}
.nss-main{display:flex;gap:22px;flex:1 1 auto;min-height:0}
.nss-hero{flex:1.05 1 0;background:linear-gradient(145deg,#fff2f8 0%,#fcd6e6 50%,#f6aecd 100%);color:#5d1039;border:2px solid #f0b3cd;border-radius:28px;padding:clamp(20px,2.8vw,34px);display:flex;flex-direction:column;gap:14px;min-width:0;animation:nssBreathe 4s ease-in-out infinite}
.nss-hero.nss-soon .nss-count{font-weight:900;box-shadow:0 0 0 3px #f6b72d}
.nss-hero-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.nss-label{font-size:clamp(13px,1.5vw,18px);font-weight:800;letter-spacing:.14em}
.nss-count{background:#b01264;color:#fff;border-radius:999px;padding:6px 16px;font-size:clamp(14px,1.6vw,18px);font-weight:700}
.nss-hero-time{font-family:Georgia,'Times New Roman',serif;font-weight:900;color:#5d1039;font-size:clamp(54px,8vw,96px);line-height:.95}
.nss-hero-time small{font-size:.42em;margin-left:6px}
.nss-hero-title{font-size:clamp(24px,3vw,38px);font-weight:800;line-height:1.15;color:#382333}
.nss-hero-room{align-self:flex-start;background:#fff;color:#d0105f;border:2px solid #f0b3cd;border-radius:16px;padding:6px 18px;font-size:clamp(30px,4.2vw,52px);font-weight:900;line-height:1.1;letter-spacing:.01em;box-shadow:0 4px 14px rgba(176,18,100,.12)}
.nss-hero-who{font-size:clamp(20px,2.4vw,30px);font-weight:700;color:#5d1039}
.nss-hero-foot{margin-top:auto;border-top:1px solid rgba(122,18,71,.22);color:#7a1247;padding-top:14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:clamp(13px,1.4vw,17px)}
.nss-tag{display:inline-flex;align-items:center;gap:7px;border-radius:9px;padding:4px 12px;font-size:15px;font-weight:800;white-space:nowrap}
.nss-tag svg{width:16px;height:16px}
.nss-tag.med{background:#b01264;color:#fff}
.nss-tag.proc{background:#5d1039;color:#fff}
.nss-tag.care{background:#f9cfe0;color:#5d1039}
.nss-hero .nss-tag{font-size:clamp(13px,1.4vw,17px);padding:5px 13px}
.nss-hero .nss-tag.med{background:#b01264;color:#fff}
.nss-hero .nss-tag.proc{background:#5d1039}
.nss-hero .nss-tag.care{background:#fff;color:#5d1039;border:1px solid #f0b3cd}
.nss-hero .nss-tag svg{width:18px;height:18px}
.nss-list{flex:1 1 0;display:flex;flex-direction:column;gap:14px;min-width:0;overflow:hidden}
.nss-list-head{display:flex;align-items:baseline;justify-content:space-between;color:#7a1247}
.nss-list-head span:last-child{font-size:16px;color:#67143f;letter-spacing:0;font-weight:600}
.nss-card{flex:1 1 0;max-height:170px;min-height:0;background:linear-gradient(120deg,#fff6fa 0%,#fde3ee 55%,#f8c9dc 100%);border:2px solid #f0b3cd;border-radius:22px;padding:14px 20px;display:flex;align-items:center;gap:20px;box-shadow:0 4px 14px rgba(122,18,71,.08);animation:nssSlideIn .6s ease-out both}
.nss-card.due{border-color:#b01264;border-width:3px}
.nss-time{width:118px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;background:#fff;border:1px solid #f0b3cd;border-radius:16px;padding:10px 4px;text-align:center}
.nss-time b{font-size:clamp(22px,2.4vw,30px);color:#5d1039;line-height:1.1}
.nss-time span{font-size:15px;font-weight:700;color:#7a1247}
.nss-card-body{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1 1 auto}
.nss-card-row{display:flex;align-items:center;gap:10px;min-width:0}
.nss-card-note{font-size:15px;color:#7a1247;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nss-card-title{font-size:clamp(19px,2.1vw,26px);color:#382333;font-weight:700;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.nss-card-who{font-size:clamp(16px,1.7vw,21px);font-weight:600;color:#5d1039;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nss-card-room{color:#d0105f;font-size:1.25em;font-weight:900}
.nss-box{flex:1 1 0;min-height:0;max-height:210px;background:linear-gradient(120deg,#fff6fa 0%,#fde3ee 55%,#f8c9dc 100%);border:2px solid #f0b3cd;border-radius:22px;padding:10px 18px 10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 4px 14px rgba(122,18,71,.08);overflow:hidden;position:relative}
.nss-box.due{border-color:#b01264;border-width:3px}
.nss-box.late{border-color:#f36a4c;border-width:3px}
.nss-box-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.nss-box-head .nss-tag{font-size:16px;padding:5px 14px}
.nss-box-meta{font-size:15px;font-weight:700;color:#7a1247;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nss-box-body{display:flex;align-items:center;gap:18px;flex:1 1 auto;min-height:0}
.nss-hero-flip{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.nss-boxes{display:flex;flex-direction:column;gap:12px;flex:1 1 auto;min-height:0}
.nss-boxes.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(0,1fr)}
.nss-boxes.grid .nss-box{max-height:none;padding:10px 14px;gap:4px}
.nss-boxes.grid .nss-box-head .nss-tag{font-size:14px;padding:4px 11px}
.nss-boxes.grid .nss-box-meta{font-size:clamp(13px,1.6vh,17px)}
.nss-boxes.grid .nss-box-body{gap:10px}
.nss-boxes.grid .nss-time{width:clamp(74px,min(8vh,5vw),100px);padding:6px 2px;border-radius:12px}
.nss-boxes.grid .nss-time b{font-size:clamp(19px,min(2.7vh,1.5vw),30px)}
.nss-boxes.grid .nss-time span{font-size:12px}
.nss-boxes.grid .nss-box:last-child:nth-child(odd){grid-column:1/-1}
.nss-boxes.grid .nss-box-care,.nss-boxes.grid .nss-box.empty:last-child{grid-column:1/-1}
.nss-boxes.grid .nss-box-head{flex-wrap:nowrap}
.nss-boxes.grid .nss-box-head .nss-tag{min-width:0;overflow:hidden;text-overflow:ellipsis}
.nss-boxes.grid .nss-box-head .nss-flip-count{flex-shrink:0}
@media (max-width:1500px){.nss-boxes.grid .nss-dots{display:none}.nss-boxes.grid .nss-box-head .nss-tag.nss-g{font-size:clamp(15px,1.45vw,26px);padding:5px 12px}}
.nss-box-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.nss-box-detail{display:flex;align-items:center;gap:8px;font-size:clamp(16px,2.1vh,24px);font-weight:700;color:#382333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.nss-box-detail-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.nss-box-detail-text.meds{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.2}
.nss-box-room{font-weight:900;color:#d0105f;font-size:clamp(26px,4vh,46px);line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nss-box-name{font-size:clamp(16px,2.2vh,24px);font-weight:700;color:#5d1039;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nss-due{color:#b01264;font-size:14px;font-weight:800;flex-shrink:0}
.nss-late{flex-shrink:0}
.nss-await{flex-shrink:0;background:#fff;border:1px solid #5b2a86;color:#5b2a86;border-radius:8px;padding:1px 8px;font-size:13px;font-weight:800}
.nss-boxes.grid .nss-box-room{font-size:clamp(21px,min(3.4vh,1.75vw),40px)}
.nss-boxes.grid .nss-box-detail{font-size:clamp(14px,min(1.9vh,1.1vw),21px)}
.nss-boxes.grid .nss-box-name{font-size:clamp(14px,min(2vh,1.15vw),21px)}
.nss-box.empty{background:#fff8fb;border-style:dashed;box-shadow:none;justify-content:flex-start}
.nss-box-empty{display:flex;align-items:center;gap:10px;flex:1 1 auto;font-size:clamp(15px,min(2vh,1.2vw),20px);font-weight:600;color:#7a1247}
.nss-box-empty svg{width:22px;height:22px;flex-shrink:0;color:#b01264}
.nss-failed{background:#fde2dc;border:1px solid #f36a4c;color:#5a1a0c;border-radius:12px;padding:6px 12px;font-size:14px;font-weight:600}
/* 2.18.15: task names larger, one colour per task type */
.nss-tag.nss-g{color:#fff;border:0;font-weight:800;letter-spacing:.01em}
.nss-tag.nss-g-vitals{background:#0e7477}
.nss-tag.nss-g-med{background:#b01264}
.nss-tag.nss-g-proc{background:#5b2a86}
.nss-tag.nss-g-care{background:#b8460b}
.nss-tag.nss-g-meal{background:#2e7d32}
.nss-box-head .nss-tag.nss-g,.nss-boxes.grid .nss-box-head .nss-tag.nss-g{font-size:clamp(17px,min(2.6vh,1.5vw),26px);padding:6px 16px;border-radius:12px}
.nss-box-head .nss-tag.nss-g svg{width:1em;height:1em}
.nss-hero .nss-tag.nss-g{font-size:clamp(17px,min(2.4vh,1.5vw),24px);padding:6px 16px;border-radius:12px;color:#fff;border:0}
.nss-hero .nss-tag.nss-g svg{width:1em;height:1em}
.nss-hero .nss-tag.nss-g-vitals{background:#0e7477}.nss-hero .nss-tag.nss-g-med{background:#b01264}.nss-hero .nss-tag.nss-g-proc{background:#5b2a86}.nss-hero .nss-tag.nss-g-care{background:#b8460b}.nss-hero .nss-tag.nss-g-meal{background:#2e7d32}
.nss-box.empty .nss-tag.nss-g{opacity:.75}
.nss-tick{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.nss-tick.run{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 14%,#000 86%,transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 14%,#000 86%,transparent 100%)}
.nss-tick-track{display:flex;flex-direction:column;gap:6px}
.nss-tick.run .nss-tick-track{animation:nssTicker linear infinite}
.nss-tick-line{display:flex;align-items:baseline;gap:8px;white-space:nowrap;overflow:hidden;font-size:clamp(15px,min(2.1vh,1.2vw),23px);font-weight:600;color:#382333;padding:2px 0}
.nss-tick-line.late .nss-tick-care{color:#b3341a}
.nss-tick-care{font-weight:800;flex-shrink:0;max-width:40%;overflow:hidden;text-overflow:ellipsis}
.nss-tick-room{color:#d0105f;font-weight:900;flex-shrink:0}
.nss-tick-name{color:#5d1039;font-weight:700;overflow:hidden;text-overflow:ellipsis}
.nss-tick-sep{color:#c98aa8}
.nss-tick-when{margin-left:auto;flex-shrink:0;font-size:.8em;font-weight:700;color:#7a1247;background:#fff;border:1px solid #f0b3cd;border-radius:8px;padding:0 7px}
@keyframes nssTicker{from{transform:translateY(0)}to{transform:translateY(calc(-50% - 3px))}}
.nss-hero-meds{margin:0;padding:0 0 0 1.6em;display:flex;flex-direction:column;gap:4px;font-size:clamp(17px,min(2.4vh,1.4vw),26px);color:#382333;max-height:30vh;overflow:hidden}
.nss-hero-meds li{line-height:1.25}
.nss-hero-meds li::marker{font-weight:800;color:#b01264}
.nss-med-warn{margin-left:10px;background:#b3341a;color:#fff;border-radius:8px;padding:1px 9px;font-size:.7em;font-weight:800;vertical-align:middle}
.nss-med-food{margin-left:10px;font-size:.75em;font-weight:600;color:#7a1247}
.nss-count.late{background:#b3341a}
.nss-hero.nss-hero-late{border-color:#f36a4c;border-width:3px}
.nss-ver{opacity:.6;font-size:.85em}
.nss-boxes.grid.grid3{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr) minmax(0,1.15fr)}
.nss-boxes.grid.grid3 .nss-box-care{grid-column:1/-1}
.nss-hero-med .nss-hero-top .nss-tag.nss-g{font-size:clamp(20px,min(3vh,1.8vw),30px);padding:7px 18px}
.nss-med-meta{display:flex;align-items:center;gap:12px;font-size:clamp(14px,1.8vh,18px);font-weight:700;color:#7a1247}
.nss-med-meta .nss-flip-count{margin-left:auto}
.nss-med-card{display:flex;flex-direction:column;gap:14px;flex:1 1 auto;min-height:0}
.nss-med-row{display:flex;align-items:center;gap:clamp(14px,2vw,28px);flex-wrap:wrap}
.nss-med-row .nss-hero-time{font-size:clamp(48px,7vh,84px)}
.nss-med-who{display:flex;flex-direction:column;gap:6px;min-width:0}
.nss-hero-meds{max-height:none;flex:0 1 auto;overflow:hidden;font-size:clamp(18px,min(2.8vh,1.6vw),30px);gap:8px;background:rgba(255,255,255,.55);border:1px solid #f0b3cd;border-radius:16px;padding:12px 16px 12px 2.2em}
.nss-hero-meds.many{font-size:clamp(15px,min(2.1vh,1.25vw),22px);gap:4px}
.nss-hero-meds li b{color:#382333}
.nss-boxes.stack{display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0}
.nss-boxes.stack .nss-box{flex:0 0 auto;max-height:none;padding:10px 16px;gap:6px}
.nss-boxes.stack .nss-box.empty{flex-direction:row;align-items:center;gap:16px;padding:8px 16px}
.nss-boxes.stack .nss-box.empty .nss-box-empty{font-size:clamp(14px,min(1.9vh,1.1vw),19px)}
.nss-boxes.stack .nss-box-care{flex:1 1 auto;min-height:120px}
.nss-boxes.stack .nss-box-head{flex-wrap:nowrap;gap:12px}
.nss-boxes.stack .nss-box-head .nss-tag.nss-g{font-size:clamp(16px,min(2.3vh,1.35vw),24px);padding:5px 14px;flex-shrink:0}
.nss-boxes.stack .nss-box-meta{flex:1 1 auto;min-width:0;font-size:clamp(13px,min(1.8vh,1vw),18px)}
.nss-boxes.stack .nss-box-body{gap:14px}
.nss-boxes.stack .nss-time{width:clamp(70px,min(8vh,5vw),96px);padding:5px 2px}
.nss-boxes.stack .nss-time b{font-size:clamp(18px,min(2.6vh,1.5vw),28px)}
.nss-boxes.stack .nss-box-text{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;align-items:baseline}
.nss-boxes.stack .nss-box-detail{grid-column:1/-1;font-size:clamp(14px,min(2vh,1.15vw),21px)}
.nss-boxes.stack .nss-box-room{font-size:clamp(22px,min(3.4vh,1.9vw),38px)}
.nss-boxes.stack .nss-box-name{font-size:clamp(15px,min(2.2vh,1.3vw),23px)}
/* 2.18.22: right-side boxes equal size, filling the height of the Medication box; medicine list with more line space */
.nss-boxes.stack{gap:14px}
.nss-boxes.stack .nss-box,.nss-boxes.stack .nss-box.empty,.nss-boxes.stack .nss-box-care{flex:1 1 0;min-height:0;max-height:none;justify-content:flex-start}
.nss-boxes.stack .nss-box.empty{flex-direction:column;align-items:stretch;gap:6px}
.nss-boxes.stack .nss-box.empty .nss-box-empty{justify-content:center}
.nss-boxes.stack .nss-box-body{flex:1 1 auto;align-items:center}
.nss-hero-med{gap:18px}
.nss-med-card{gap:22px}
.nss-hero-meds{gap:16px;padding:18px 22px 18px 2.4em;line-height:1.45}
.nss-hero-meds li{line-height:1.45;padding:4px 0;border-bottom:1px dashed #f0c2d6}
.nss-hero-meds li:last-child{border-bottom:0}
.nss-hero-meds li .nss-med-food{display:block;margin:4px 0 0 0;font-size:.72em}
.nss-hero-meds li .nss-med-warn{margin-left:12px}
.nss-hero-meds.many{gap:8px}
.nss-hero-meds.many li{padding:2px 0}
.nss-start-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#d42a74,#b01264)!important;color:#fff!important;border:0!important;border-radius:999px!important;padding:8px 16px!important;font-weight:800!important;font-size:14px!important;box-shadow:0 4px 12px rgba(176,18,100,.28);white-space:nowrap;cursor:pointer}
.nss-start-btn:hover{filter:brightness(1.08)}
@media (max-width:760px){.nss-start-btn{padding:7px 12px!important;font-size:13px!important}}
.nss-tick-usual{flex-shrink:0;margin-left:auto;font-size:.68em;font-weight:800;color:#8a4a00;background:#fff3e0;border:1px dashed #e0a060;border-radius:8px;padding:1px 8px}
.nss-tick-usual+.nss-tick-when{margin-left:8px}
.nss-noplan{font-size:13px;font-weight:800;color:#8a4a00;background:#fff3e0;border:1px solid #e0a060;border-radius:999px;padding:2px 10px;white-space:nowrap}
.nss-med-later{display:block;font-weight:600;font-size:.9em;color:#7a1247;margin-top:2px}
.nss-flip{animation:nssFlip .55s ease-out both;transform-origin:50% 0;backface-visibility:hidden}
.nss-flip-count{display:flex;align-items:center;gap:8px;margin-left:auto;font-size:13px;font-weight:700;color:#7a1247}
.nss-hero .nss-flip-count{align-self:flex-start;font-size:15px}
.nss-dots{display:flex;gap:4px}
.nss-dots i{width:7px;height:7px;border-radius:50%;background:#f0b3cd;display:block}
.nss-dots i.on{background:#b01264}
.nss-late{background:#b3341a;color:#fff;border-radius:8px;padding:2px 10px;font-size:14px;font-weight:800}
@keyframes nssFlip{from{opacity:0;transform:perspective(600px) rotateX(-75deg)}to{opacity:1;transform:none}}
.nss-empty{background:#fff;border:2px dashed #f3bfd6;border-radius:18px;padding:18px;text-align:center;color:#7a1247;font-weight:600}
.nss-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:clamp(13px,1.4vw,16px);color:#67143f}
.nss-touch{background:#fff;border:1px solid #ead0de;border-radius:999px;padding:8px 18px;font-weight:700;color:#b01264}
@keyframes nssBreathe{0%,100%{box-shadow:0 0 0 0 rgba(208,16,95,0)}50%{box-shadow:0 0 0 14px rgba(208,16,95,.18)}}
@keyframes nssBorder{0%,100%{border-color:#f36a4c}50%{border-color:#ffc2b3}}
@keyframes nssColon{0%,49%{opacity:1}50%,100%{opacity:.25}}
@keyframes nssDrift{0%,100%{transform:translate(0,0)}25%{transform:translate(3px,-2px)}50%{transform:translate(-2px,3px)}75%{transform:translate(-3px,-1px)}}
@keyframes nssSlideIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (max-width:760px){
  .nss-main{flex-direction:column;overflow:auto}
  .nss-hero{flex:0 0 auto}
  .nss-list{flex:0 0 auto}
  .nss-shift .nss-onduty{display:none}
  .nss-chip{font-size:12px;padding:6px 10px;white-space:nowrap}
  .nss-chip-hours{display:none}
  .nss-logo{padding:4px 6px}
  .nss-logo img{height:40px}
  .nss-date{font-size:12px;white-space:nowrap}
  .nss-foot{justify-content:center}
  .nss-foot>span:not(.nss-touch){display:none}
  .nss-overdue{padding:10px 12px;gap:8px}
  .nss-card{flex:0 0 auto;padding:11px 13px;gap:12px}
  .nss-box{flex:0 0 auto;padding:10px 12px}
  .nss-boxes.grid{display:flex}
      .nss-box-body{gap:12px}
  .nss-box-meta{font-size:13px}
  .nss-box-room{font-size:24px}
  .nss-box-detail,.nss-box-name{font-size:15px}
  .nss-time{width:72px}
  .nss-time b{font-size:18px}
  .nss-time span{font-size:12px}
  .nss-card-title{font-size:17px}
  .nss-card-who{font-size:15px}
  .nss-tag{font-size:12px}
  .nss-overdue-more{margin-left:0}
}
/* 2.18.33: short screens (laptops 1366x768 at 125% in Edge with toolbars) — compact, nothing cut off;
   "Nothing due" boxes shrink to one line so boxes with real tasks get the room */
@media (max-height:780px) and (min-width:761px){
 .nss-inner{padding:10px 18px 8px;gap:8px}
 .nss-logo{padding:3px 8px;border-radius:12px}.nss-logo img{height:38px}
 .nss-clock{font-size:34px}.nss-date{font-size:13px;margin-top:2px}
 .nss-shift{gap:4px}.nss-chip{font-size:13px;padding:4px 12px}.nss-onduty{font-size:13px}
 .nss-overdue{padding:5px 12px;gap:10px;border-radius:12px;flex-wrap:nowrap;min-width:0}
 .nss-overdue-tag{font-size:12px;padding:3px 8px;flex-shrink:0}
 .nss-overdue-text{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
 .nss-overdue-more{font-size:13px;flex-shrink:0;white-space:nowrap}
 .nss-main{gap:14px}
 .nss-hero{padding:14px 18px;border-radius:20px;gap:8px}
 .nss-hero-title{font-size:24px}.nss-hero-who{font-size:17px}
 .nss-hero-med .nss-hero-top .nss-tag.nss-g{font-size:17px;padding:4px 12px}
 .nss-med-row .nss-hero-time{font-size:44px}.nss-hero-room{font-size:30px;padding:3px 12px}
 .nss-hero-meds{font-size:17px;gap:6px;padding:8px 12px 8px 2em}.nss-hero-meds li{padding:1px 0}
 .nss-med-card{gap:10px}.nss-hero-foot{padding-top:6px;font-size:13px}
 .nss-list{gap:6px}.nss-list-head .nss-label{font-size:12px}.nss-list-head span:last-child{font-size:13px}
 .nss-boxes.stack{gap:7px}
 .nss-boxes.stack .nss-box{padding:6px 12px;gap:4px;border-radius:14px}
 .nss-boxes.stack .nss-box.empty{flex:0 0 auto;flex-direction:row;align-items:center;gap:12px;padding:5px 12px}
 .nss-boxes.stack .nss-box.empty .nss-box-head{flex:0 0 auto}
 .nss-boxes.stack .nss-box.empty .nss-box-empty{font-size:14px;justify-content:flex-start}
 .nss-boxes.stack .nss-box-head .nss-tag.nss-g{font-size:15px;padding:3px 10px;border-radius:9px}
 .nss-boxes.stack .nss-box-meta{font-size:13px}.nss-flip-count{font-size:12px}
 .nss-boxes.stack .nss-box-body{gap:10px}
 .nss-boxes.stack .nss-time{width:66px;padding:3px 2px;border-radius:10px}.nss-boxes.stack .nss-time b{font-size:18px}.nss-boxes.stack .nss-time span{font-size:11px}
 .nss-boxes.stack .nss-box-detail{font-size:14px}.nss-late{font-size:12px;padding:1px 7px}
 .nss-boxes.stack .nss-box-room{font-size:21px}.nss-boxes.stack .nss-box-name{font-size:14px}
 .nss-boxes.stack .nss-box-care{min-height:70px}
 .nss-tick-line{font-size:14px;padding:1px 0}.nss-tick-track{gap:3px}
 .nss-foot{font-size:12px;gap:10px}.nss-touch{padding:4px 12px}
}
@media (max-height:600px) and (min-width:761px){
 .nss-date,.nss-onduty{display:none}
 .nss-clock{font-size:28px}.nss-logo img{height:30px}
 .nss-foot>span:first-child{display:none}
 .nss-boxes.stack .nss-box-room{font-size:18px}
}
@media (prefers-reduced-motion:reduce){.nss-inner,.nss-hero,.nss-overdue,.nss-colon,.nss-card,.nss-flip,.nss-tick-track{animation:none!important}}
`;
    document.head.appendChild(s);
  }

  const NSS_ICON={
    med:h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2.2,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'},h('path',{d:'M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z'}),h('path',{d:'M7 7l7 7'})),
    proc:h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2.2,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'},h('path',{d:'M17 3l4 4'}),h('path',{d:'M19 5L8 16'}),h('path',{d:'M6 13l5 5'}),h('path',{d:'M4 20l3-3'})),
    care:h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2.2,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'},h('path',{d:'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'}))
  };
  const NSS_KIND_LABEL={med:'Medication',proc:'Nursing Procedure',care:'Care'};

  function nssLocalISO(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function nssAt(dateISO,hhmm){const d=new Date(`${dateISO}T${String(hhmm).slice(0,5)}:00`);return Number.isNaN(d.getTime())?null:d}
  function nssShiftWindow(now=new Date()){
    const hr=now.getHours();
    const start=new Date(now);start.setSeconds(0,0);start.setMinutes(0);
    if(hr>=7&&hr<19){start.setHours(7)}
    else if(hr>=19){start.setHours(19)}
    else{start.setDate(start.getDate()-1);start.setHours(19)}
    const end=new Date(start.getTime()+12*3600000);
    const name=start.getHours()===7?'Day Shift (7 AM–7 PM)':'Night Shift (7 PM–7 AM)';
    const dates=[nssLocalISO(start),nssLocalISO(new Date(start.getTime()+86400000))];
    return {start,end,name,dates};
  }
  // A clock time (HH:MM) that falls inside this shift, as a full date-time (night shift crosses midnight).
  function nssTimeInShift(win,hhmm){
    for(const d of win.dates){const at=nssAt(d,hhmm);if(at&&at>=win.start&&at<win.end)return {at,date:d}}
    return null;
  }
  function nssTime12(d){const hr=d.getHours(),m=d.getMinutes();return {t:`${hr%12||12}:${String(m).padStart(2,'0')}`,ap:hr<12?'AM':'PM'}}
  function nssGuest(p){
    if(!p)return 'Guest';
    const name=String(p.full_name||'').trim();
    const room=[p.room_no,p.bed_no].filter(x=>x&&String(x).trim()).join('-');
    return [room?`Room ${room}`:'',name?[p.title,name].filter(Boolean).join(' '):''].filter(Boolean).join(' · ')||'Guest';
  }
  function nssRoomOf(p){const r=[p?.room_no,p?.bed_no].filter(x=>x&&String(x).trim()).join('-');return r?`Room ${r}`:''}
  function nssNameOf(p){const n=String(p?.full_name||'').trim();return n?[p.title,n].filter(Boolean).join(' '):''}
  function nssRoomSort(p){return String(p?.room_no||'')}
  function nssIsSlidingScale(o){
    const text=[o?.medicine_name,o?.instructions,o?.special_instructions,o?.remarks,o?.dose].filter(Boolean).join(' ');
    return /sliding\s*scale|as\s+per\s+(blood\s*)?sugar|according\s+to\s+(blood\s*)?sugar|\b(grbs|cbg)\b/i.test(text)
      ||(/insulin/i.test(String(o?.medicine_name||''))&&!String(o?.strength||'').trim());
  }
  function nssGuestActive(p){return p&&p.is_active!==false&&p.admission_status!=='Discharged'}
  function nssMealKind(t){const s=String(t||'').toLowerCase();return /break|tiffin/.test(s)?'Breakfast':/lunch/.test(s)?'Lunch':/dinner|supper/.test(s)?'Dinner':''}

  // One read with a simpler fallback query if the first is refused.
  async function nssRead(primary,fallback){
    const a=await primary();
    if(!a?.error||!fallback)return a;
    const b=await fallback();
    return b?.error?a:b;
  }
  // Builds every task of the current shift from the same tables Shift Tasks reads. Read only.
  async function loadNurseSaverTasks(){
    const now=new Date();
    const win=nssShiftWindow(now);
    const fields='id,title,full_name,room_no,bed_no,is_active,admission_status,admission_date,vitals_schedule,diet_plan';
    const dayBefore=addDaysISODate(win.dates[0],-1);
    const [m,ml,c,cl,pr,pts,vs,mr]=await Promise.all([
      // 2.18.14: plain reads (no embedded Guest lookup) with a fallback; Guests are joined here from the Guest list.
      nssRead(()=>client.from('medication_orders').select('*').or(`is_active.eq.true,stopped_at.gt.${now.toISOString()}`),()=>client.from('medication_orders').select('*').eq('is_active',true)),
      client.from('medication_administrations').select('order_id,scheduled_date,scheduled_time,status,rescheduled_time').in('scheduled_date',[dayBefore,...win.dates]),
      nssRead(()=>client.from('care_orders').select('*').eq('is_active',true),()=>client.from('care_orders').select('*')),
      // 2.18.24: last 3 days of care records too, for Guests who have no care plan ("usual care").
      nssRead(()=>client.from('care_logs').select('care_order_id,patient_id,care_date,shift,status,remarks,completed_at,scheduled_time').gte('care_date',addDaysISODate(win.dates[0],-3)).lte('care_date',win.dates[1]),()=>client.from('care_logs').select('care_order_id,patient_id,care_date,shift,status,remarks,completed_at').gte('care_date',addDaysISODate(win.dates[0],-3)).lte('care_date',win.dates[1])), // 2.18.27: scheduled_time (SQL 252)
      client.from('nursing_procedure_requests').select('id,patient_id,procedure_name,procedure_code,category,status,scheduled_at').in('status',['Requested','Approved']).limit(300),
      client.from('patients').select(fields).eq('is_active',true),
      client.from('vital_signs').select('patient_id,recorded_at').gte('recorded_at',new Date(win.start.getTime()-2*3600000).toISOString()),
      client.from('meal_records').select('patient_id,meal_date,meal_type').in('meal_date',win.dates)
    ]);
    const firstError=[m,ml,c,cl,pr,pts,vs,mr].find(r=>r?.error);
    if(firstError&&!m.data&&!c.data)throw firstError.error;
    // 2.18.11: a source that could not be read is named on screen and logged for System Health (never silently shown as "nothing due").
    const failed=[['Medicines',m],['Medicine records',ml],['Care plan',c],['Care records',cl],['Approval Requests',pr],['Guests',pts],['Vital signs',vs],['Meal records',mr]].filter(([,r])=>r?.error).map(([n,r])=>({name:n,message:r.error.message||String(r.error)}));
    if(failed.length){try{window.SamaraFault?.('nurse-screensaver','Screensaver could not read: '+failed.map(f=>f.name).join(', '),{errors:failed.map(f=>`${f.name}: ${f.message}`.slice(0,200))})}catch(_){}}
    const guests=(pts.data||[]).filter(nssGuestActive);
    const guestMap=new Map(guests.map(p=>[p.id,p]));
    (m.data||[]).forEach(o=>{o.patients=guestMap.get(o.patient_id)||null});
    (c.data||[]).forEach(o=>{if(o.is_active===false)o.patients=null;else o.patients=guestMap.get(o.patient_id)||null});
    const tasks=[];

    // Medicines — grouped per Guest per dose time (shown as a count).
    const medLogs=ml.data||[];
    const doseDone=(orderId,date,time)=>medLogs.some(x=>x.order_id===orderId&&String(x.scheduled_date||'').slice(0,10)===date&&normalizeMedicationTime(x.scheduled_time).slice(0,5)===time);
    const groups=new Map();
    const addDose=(order,date,time,at)=>{
      const p=order.patients;if(!nssGuestActive(p))return;
      const key=`${order.patient_id}|${at.getTime()}`;
      if(!groups.has(key))groups.set(key,{patient:p,at,orders:[],done:0,pending:0});
      const g=groups.get(key);
      if(doseDone(order.id,date,time))g.done++;else{g.pending++;g.orders.push(order)}
    };
    (m.data||[]).forEach(order=>(order.scheduled_times||[]).forEach(raw=>{
      const time=normalizeMedicationTime(raw).slice(0,5);if(!/^\d{2}:\d{2}$/.test(time))return;
      const slot=nssTimeInShift(win,time);if(!slot)return;
      if(!medicationOrderDoseEligible(order,slot.date,time))return;
      addDose(order,slot.date,time,slot.at);
    }));
    medLogs.filter(x=>x.rescheduled_time).forEach(log=>{
      const order=(m.data||[]).find(o=>o.id===log.order_id);if(!order)return;
      const time=normalizeMedicationTime(log.rescheduled_time).slice(0,5);const date=rescheduledDoseDate(log);
      const at=nssAt(date,time);if(!at||at<win.start||at>=win.end)return;
      addDose(order,date,time,at);
    });
    groups.forEach(g=>{
      const n=g.pending;
      const sliding=g.orders.find(nssIsSlidingScale);
      const foods=[...new Set(g.orders.map(o=>String(o.food_instruction||'').trim()).filter(Boolean))];
      const note=foods.length===1?foods[0]:'';
      // 2.18.18: medicine names with serial numbers (sliding-scale insulin: check sugar first).
      const meds=g.orders.map(o=>({name:[o.medicine_name||'Medicine',String(o.strength||'').trim()].filter(Boolean).join(' '),
        sliding:nssIsSlidingScale(o),food:String(o.food_instruction||'').trim(),route:String(o.route||'').trim()}));
      tasks.push({kind:'med',group:'med',at:g.at,grace:30,patient:g.patient,done:n===0,meds,
        title:`Medicines (${n})`,
        medLine:meds.map((m,i)=>`${i+1}. ${m.name}${m.sliding?' (check sugar first)':''}`).join('   '),
        note});
    });

    // Vital signs — per Guest's own vitals times (default 6 AM / 2 PM / 10 PM).
    const vit=vs.data||[];
    guests.forEach(p=>{
      const times=(Array.isArray(p.vitals_schedule)&&p.vitals_schedule.length?p.vitals_schedule:['06:00','14:00','22:00']).map(t=>String(t).slice(0,5));
      times.forEach(t=>{
        const slot=nssTimeInShift(win,t);if(!slot)return;
        if(p.admission_date&&String(p.admission_date).slice(0,10)>slot.date)return;
        const done=vit.some(v=>{if(v.patient_id!==p.id)return false;const r=new Date(v.recorded_at).getTime();return r>=slot.at.getTime()-90*60000&&r<slot.at.getTime()+4*3600000});
        tasks.push({kind:'care',group:'vitals',at:slot.at,grace:60,patient:p,done,title:'Vital signs',note:''});
      });
    });

    // Daily care — preferred window when set, else any time in the shift (reminder 2 h before shift end).
    const careLogs=cl.data||[];
    const careStats={planned:0,done:0};
    (c.data||[]).forEach(order=>{
      const p=order.patients;if(!nssGuestActive(p))return;
      // 2.18.27: a Nursing Procedure with fixed times (like medicines) — one task per time in this shift;
      // done when a record exists for that time (or, for a record without a time, given near that time).
      const fixedTimes=String(order.order_kind||'')==='Nursing Procedure'&&Array.isArray(order.scheduled_times)?[...new Set(order.scheduled_times.map(t=>String(t||'').slice(0,5)).filter(t=>/^\d{2}:\d{2}$/.test(t)))]:[];
      if(fixedTimes.length){
        const label=order.care_type||'Nursing procedure';
        fixedTimes.forEach(t=>{
          const slot=nssTimeInShift(win,t);if(!slot)return;
          if(order.start_date&&String(order.start_date).slice(0,10)>slot.date)return;
          const done=careLogs.some(x=>x.care_order_id===order.id&&String(x.care_date).slice(0,10)===slot.date&&(
            x.scheduled_time?String(x.scheduled_time).slice(0,5)===t:(x.completed_at&&Math.abs(new Date(x.completed_at).getTime()-slot.at.getTime())<=3*3600000)));
          tasks.push({kind:'proc',group:'proc',at:slot.at,grace:60,patient:p,done,title:label,planned:true,fixedTime:t,
            note:[order.procedure_code||'',order.frequency||''].filter(Boolean).join(' · ')});
        });
        return;
      }
      const sh=String(order.shift||'Both shifts').toLowerCase();
      const isDay=win.name.startsWith('Day');
      if(!(sh.includes('both')||sh===''||(isDay?sh.includes('day'):sh.includes('night'))))return;
      const label=order.care_type||order.activity||'Care task';
      // 2.18.26: a planned Nursing Procedure (Admission Section 5 / patient file → Nursing) goes to the
      // Nursing Procedure box, not Care; it is recorded the same way (Shift Tasks / Daily Care).
      const isProc=String(order.order_kind||'')==='Nursing Procedure';
      const grp=isProc?'proc':'care';
      if(!isProc)careStats.planned++;
      const done=careLogs.some(x=>String(x.shift||'').toLowerCase().startsWith(win.name.slice(0,3).toLowerCase())&&(!x.completed_at||new Date(x.completed_at)>=win.start)&&(
        x.care_order_id===order.id||(!x.care_order_id&&x.patient_id===order.patient_id&&String(x.remarks||'').toLowerCase().startsWith(String(label).toLowerCase()))));
      if(done&&!isProc)careStats.done++;
      const from=careTimeValue(order.preferred_from),to=careTimeValue(order.preferred_to);
      const fromAt=from?nssTimeInShift(win,from)?.at:null,toAt=to?nssTimeInShift(win,to)?.at:null;
      if(fromAt||toAt){
        tasks.push({kind:isProc?'proc':'care',group:grp,at:fromAt||toAt,deadline:toAt||null,grace:0,patient:p,done,title:label,planned:isProc,
          windowText:fromAt&&toAt?`${nssTime12(fromAt).t}–${nssTime12(toAt).t}`:'',
          note:[isProc&&order.procedure_code?order.procedure_code:'',toAt?`ends ${nssTime12(toAt).t} ${nssTime12(toAt).ap}`:''].filter(Boolean).join(' · ')});
      }else{
        tasks.push({kind:isProc?'proc':'care',group:grp,at:new Date(win.end.getTime()-2*3600000),anyTime:true,grace:120,patient:p,done,title:label,planned:isProc,
          note:[isProc?(order.procedure_code||'planned'):'',order.frequency&&isProc?order.frequency:'','any time this shift'].filter(Boolean).join(' · ')});
      }
    });

    // 2.18.24: Guests with NO care plan — show their usual care for this shift from the last 3 days' records
    // (marked "usual — no care plan"), so the Care box is not empty; the Nursing Manager is reminded to fill the plan.
    const withPlan=new Set((c.data||[]).filter(o=>o.is_active!==false&&String(o.order_kind||'')!=='Nursing Procedure').map(o=>o.patient_id)); // 2.18.26: procedures alone are not a care plan
    const shiftKey=x=>String(x||'').toLowerCase().startsWith('day')?'day':String(x||'').toLowerCase().startsWith('night')?'night':'';
    const curKey=win.name.startsWith('Day')?'day':'night';
    const shiftDate=win.dates[0];
    const noPlanGuests=guests.filter(p=>!withPlan.has(p.id));
    noPlanGuests.forEach(p=>{
      const logs=careLogs.filter(x=>x.patient_id===p.id&&!x.care_order_id&&String(x.status||'').toLowerCase()!=='refused'&&String(x.remarks||'').trim());
      const usual=[...new Set(logs.filter(x=>shiftKey(x.shift)===curKey&&String(x.care_date).slice(0,10)<shiftDate).map(x=>String(x.remarks).trim().split(/\s*[—:–-]\s+/)[0]))];
      usual.forEach(label=>{
        careStats.planned++;
        const done=logs.some(x=>shiftKey(x.shift)===curKey&&String(x.care_date).slice(0,10)===shiftDate&&String(x.remarks).trim().toLowerCase().startsWith(label.toLowerCase()));
        if(done)careStats.done++;
        tasks.push({kind:'care',group:'care',at:new Date(win.end.getTime()-2*3600000),anyTime:true,grace:120,patient:p,done,title:label,usual:true,note:'usual — no care plan'});
      });
    });
    careStats.noPlan=noPlanGuests.length;

    // Nursing Procedures / items — every OPEN request (as in Approval Requests → Open Requests):
    // Approved = "Ready to Start"; Requested = "Awaiting approval" (2.18.16). Shown for the whole shift, not only 4 hours.
    (pr.data||[]).forEach(r=>{
      const p=guestMap.get(r.patient_id);if(!p)return;
      const at=r.scheduled_at?new Date(r.scheduled_at):null;
      if(at&&(Number.isNaN(at.getTime())||at>=win.end))return;
      const pending=r.status==='Requested';
      const cat=r.category&&r.category!=='Nursing Procedures'?r.category:'';
      tasks.push({kind:'proc',group:'proc',at:at&&at>win.start?at:now,atScheduled:!!at,ready:!at&&!pending,awaiting:pending,grace:pending?100000:30,patient:p,done:false,
        title:r.procedure_name||'Nursing procedure',
        note:[cat,pending?'awaiting approval':'approved · Confirm & Start'].filter(Boolean).join(' · '),
        procCategory:r.category||''});
    });

    // Meals — one box for all Guests not yet recorded (Breakfast 8 AM, Lunch 1 PM, Dinner 8 PM).
    const meals=mr.data||[];
    [['08:00','Breakfast'],['13:00','Lunch'],['20:00','Dinner']].forEach(([t,label])=>{
      const slot=nssTimeInShift(win,t);if(!slot)return;
      const eligible=guests.filter(p=>!/tube/i.test(String(p.diet_plan||''))&&!(p.admission_date&&String(p.admission_date).slice(0,10)>slot.date));
      const pending=eligible.filter(p=>!meals.some(r=>r.patient_id===p.id&&String(r.meal_date).slice(0,10)===slot.date&&nssMealKind(r.meal_type)===label));
      if(!eligible.length)return;
      tasks.push({kind:'care',group:'meal',mealLabel:label,pendingGuests:pending,at:slot.at,grace:30,patient:null,done:pending.length===0,
        title:`${label} — record food intake`,who:`${pending.length} of ${eligible.length} Guests`,note:'meal time',
        room:pending.length===1?nssRoomOf(pending[0]):`${pending.length} Guests`,
        name:pending.length===1?nssNameOf(pending[0]):pending.slice(0,3).map(p=>`${nssNameOf(p)} (${String(p.room_no||'').trim()||'—'})`).join(', ')+(pending.length>3?` + ${pending.length-3} more`:'')});
    });

    tasks.forEach(x=>{
      const limit=x.deadline?x.deadline.getTime():x.at.getTime()+x.grace*60000;
      x.state=x.done?'done':x.awaiting?'upcoming':now.getTime()>=limit&&!x.anyTime&&!x.ready?'overdue':now>=x.at?'due':'upcoming';
      if(x.anyTime&&!x.done&&now.getTime()>=win.end.getTime()-60*60000)x.state='overdue';
      if(!x.who)x.who=x.patient?nssGuest(x.patient):'';
      if(x.patient){x.room=nssRoomOf(x.patient);x.name=nssNameOf(x.patient)}
      if(x.room===undefined){x.room='';x.name=x.who}
    });
    const order=(a,b)=>a.at-b.at||nssRoomSort(a.patient).localeCompare(nssRoomSort(b.patient),undefined,{numeric:true});
    const open=tasks.filter(x=>x.state!=='done');
    return {
      win,loadedAt:now,failed,careStats,
      overdue:open.filter(x=>x.state==='overdue').sort(order),
      next:open.filter(x=>x.state!=='overdue'&&(x.anyTime||x.group==='proc'||x.group==='care'||x.group==='med'||x.at.getTime()<=now.getTime()+NURSE_SAVER_HORIZON_MS)).sort((a,b)=>(a.anyTime||(a.awaiting&&!a.atScheduled)?1:0)-(b.anyTime||(b.awaiting&&!b.atScheduled)?1:0)||order(a,b)),
      total:tasks.length,done:tasks.filter(x=>x.done).length,
      // 2.18.21: counted per task type (before, Vital Signs and Meals were counted as "Care").
      byKind:Object.fromEntries(['med','vitals','proc','meal','care'].map(g=>[g,tasks.filter(x=>x.group===g).length]))
    };
  }

  function nssCountdown(task,now){
    if(task.awaiting)return 'Awaiting approval';
    if(task.ready)return 'Ready to start';
    if(task.anyTime)return 'Any time this shift';
    const mins=Math.round((task.at.getTime()-now.getTime())/60000);
    if(mins<=0)return 'Due now';
    if(mins<60)return `in ${mins} min`;
    const hrs=Math.floor(mins/60),rest=mins%60;
    return rest?`in ${hrs} h ${rest} min`:`in ${hrs} h`;
  }
  function nssTag(kind,label,group){return h('span',{className:`nss-tag ${kind}${group?` nss-g nss-g-${group}`:''}`},NSS_ICON[kind],label||NSS_KIND_LABEL[kind])}
  function nssTimeBox(task){
    if(task.ready)return h('div',{className:'nss-time'},h('b',null,'Now'),h('span',null,'ready'));
    if(task.anyTime)return h('div',{className:'nss-time'},h('b',null,'Any'),h('span',null,'time'));
    if(task.windowText)return h('div',{className:'nss-time'},h('b',null,task.windowText),h('span',null,'window'));
    const t=nssTime12(task.at);return h('div',{className:'nss-time'},h('b',null,t.t),h('span',null,t.ap));
  }


  // 2.18.10: right side = one box per task type; the Guests in a box flip one at a time.
  const NSS_GROUPS={vitals:{label:'Vital Signs',kind:'care',perGuest:true},med:{label:'Medication',kind:'med',perGuest:true},
    proc:{label:'Nursing Procedure',kind:'proc'},care:{label:'Care',kind:'care'},meal:{label:'Meals',kind:'care',perGuest:true}};
  const NSS_GROUP_ORDER=['vitals','proc','meal','care']; // 2.18.20: Medication has the big left box
  function nssWhenText(x){if(x.awaiting&&!x.atScheduled)return 'Any time';if(x.ready)return 'Ready';if(x.anyTime)return 'Any time';if(x.windowText)return x.windowText;const t=nssTime12(x.at);return `${t.t} ${t.ap}`}
  function nssEntriesOf(x){
    const base={at:x.at,when:nssWhenText(x),late:x.state==='overdue',due:x.state==='due',awaiting:!!x.awaiting,sortAt:x.anyTime||(x.awaiting&&!x.atScheduled)?Infinity:x.at.getTime()};
    if(x.group==='meal')return (x.pendingGuests||[]).map(p=>({...base,room:nssRoomOf(p),name:nssNameOf(p),detail:`${x.mealLabel} — record food intake`}));
    const detail=x.group==='vitals'?'':x.group==='med'&&x.medLine?x.medLine:x.title;
    return [{...base,usual:!!x.usual,room:x.room||'',name:x.name||x.who||'',detail,note:x.group==='care'||(x.group==='proc'&&!x.awaiting)?x.note:''}];
  }
  function nssBuildBoxes(items){
    const boxes=new Map();
    items.forEach(x=>{
      const g=x.group||(x.kind==='med'?'med':x.kind==='proc'?'proc':'care');
      if(!boxes.has(g))boxes.set(g,{group:g,...NSS_GROUPS[g],entries:[]});
      boxes.get(g).entries.push(...nssEntriesOf(x));
    });
    NSS_GROUP_ORDER.forEach(g=>{if(!boxes.has(g))boxes.set(g,{group:g,...NSS_GROUPS[g],entries:[]})});
    const empty=[...boxes.values()].filter(b=>!b.entries.length).map(b=>({...b,empty:true,meta:'Nothing due',first:Infinity}));
    return [...boxes.values()].filter(b=>b.entries.length).map(b=>{
      b.entries.sort((a,c)=>(c.late?1:0)-(a.late?1:0)||a.sortAt-c.sortAt||String(a.room).localeCompare(String(c.room),undefined,{numeric:true}));
      const guests=new Set(b.entries.map(e=>`${e.room}|${e.name}`)).size;
      const nextOne=b.entries.find(e=>!e.late);
      const lateCount=b.entries.filter(e=>e.late).length;
      b.meta=[b.perGuest?`${guests} Guest${guests===1?'':'s'}`:`${b.entries.length}`,nextOne?`next ${nextOne.when}`:'',lateCount?`${lateCount} late`:''].filter(Boolean).join(' · ');
      b.first=b.entries[0].late?-Infinity:b.entries[0].sortAt;
      return b;
    }).sort((a,c)=>a.first-c.first||NSS_GROUP_ORDER.indexOf(a.group)-NSS_GROUP_ORDER.indexOf(c.group))
      .concat(empty.sort((a,c)=>NSS_GROUP_ORDER.indexOf(a.group)-NSS_GROUP_ORDER.indexOf(c.group)))
      // 2.18.17: the Care list goes last, full width, so each line has room for care · room · name.
      .sort((a,c)=>(a.group==='care'?1:0)-(c.group==='care'?1:0));
  }
  // 4 s per Guest; quicker (3 s) when a box holds many Guests, so a full house (19 Guests) still cycles in a reasonable time.
  function nssFlipPeriod(n){return n>8?3:NURSE_SAVER_FLIP_SEC}
  function nssFlipIndex(n,now,offset){return n<=1?0:Math.floor((Math.floor(now.getTime()/1000)+offset)/nssFlipPeriod(n))%n}
  function nssDots(n,i){
    if(n<=1)return null;
    return h('span',{className:'nss-flip-count'},`${i+1} of ${n}`,n<=10&&h('span',{className:'nss-dots','aria-hidden':'true'},Array.from({length:n},(_,k)=>h('i',{key:k,className:k===i?'on':''}))));
  }

  function NurseIdleScreensaver({profile,page,alertKey}){
    // 2.18.12: Nurse and Nursing Manager logins.
    const isNurse=profile?.role==='Nurse'||(typeof isNursingManagerProfile==='function'&&isNursingManagerProfile(profile));
    const [visible,setVisible]=React.useState(false);
    const [data,setData]=React.useState(null);
    const [error,setError]=React.useState('');
    const [now,setNow]=React.useState(()=>new Date());
    const lastActivity=React.useRef(Date.now());
    const visibleRef=React.useRef(false);
    const blockedRef=React.useRef(false);
    blockedRef.current=page==='Talk to Guest';
    visibleRef.current=visible;

    // Idle watch: the same activity events as the idle sign-out. Never shown while a camera / video is playing.
    React.useEffect(()=>{
      if(!isNurse)return;
      ensureNurseSaverStyles();
      const mark=()=>{if(!visibleRef.current)lastActivity.current=Date.now()};
      const events=['click','keydown','touchstart','pointerdown','input','change','scroll','wheel','mousemove'];
      events.forEach(n=>window.addEventListener(n,mark,{passive:true,capture:true}));
      const mediaBusy=()=>{try{return [...document.querySelectorAll('video,audio')].some(v=>!v.paused&&!v.ended)}catch(_){return false}};
      const check=()=>{
        if(visibleRef.current||blockedRef.current||document.visibilityState!=='visible')return;
        if(Date.now()-lastActivity.current>=NURSE_SAVER_IDLE_MS&&!mediaBusy())setVisible(true);
      };
      const timer=setInterval(check,5000);
      return()=>{clearInterval(timer);events.forEach(n=>window.removeEventListener(n,mark,true))};
    },[isNurse]);

    // 2.18.23: "Start Screen Saver" button in the top bar opens it at once.
    React.useEffect(()=>{
      if(!isNurse)return;
      const open=()=>{ensureNurseSaverStyles();setVisible(true)};
      window.addEventListener('samara-start-screensaver',open);
      return()=>window.removeEventListener('samara-start-screensaver',open);
    },[isNurse]);

    // A NEW clinical alert pop-up closes the screensaver so the pop-up is seen.
    const lastAlertKey=React.useRef(alertKey);
    React.useEffect(()=>{
      if(alertKey&&alertKey!==lastAlertKey.current&&visibleRef.current){setVisible(false);lastActivity.current=Date.now()}
      lastAlertKey.current=alertKey;
    },[alertKey]);

    // While shown: clock (and card flips) every second, tasks every 60 s.
    React.useEffect(()=>{
      if(!visible)return;
      let alive=true;
      const load=()=>loadNurseSaverTasks().then(d=>{if(alive){setData(d);setError('')}}).catch(e=>{if(alive)setError(e?.message||'Could not load tasks')});
      load();setNow(new Date());
      const clock=setInterval(()=>setNow(new Date()),1000);
      const refresh=setInterval(load,60000);
      const onKey=e=>{e.preventDefault();close()};
      window.addEventListener('keydown',onKey,true);
      return()=>{alive=false;clearInterval(clock);clearInterval(refresh);window.removeEventListener('keydown',onKey,true)};
    },[visible]);

    // 2.18.13: keep the monitor on while the screensaver is showing (Screen Wake Lock; Chrome / Edge).
    // Without it Windows power settings turn the display black after a few minutes. Released as soon as it closes.
    React.useEffect(()=>{
      if(!visible||!navigator.wakeLock?.request)return;
      let lock=null,alive=true;
      const take=async()=>{
        if(!alive||document.visibilityState!=='visible'||(lock&&!lock.released))return;
        try{lock=await navigator.wakeLock.request('screen')}catch(e){try{window.SamaraFault?.('nurse-screensaver','Keep-screen-on not allowed',{error:String(e?.message||e).slice(0,160)})}catch(_){}}
      };
      take();
      const onVis=()=>{if(document.visibilityState==='visible')take()};
      document.addEventListener('visibilitychange',onVis);
      return()=>{alive=false;document.removeEventListener('visibilitychange',onVis);try{lock?.release()}catch(_){}};
    },[visible]);

    function close(){lastActivity.current=Date.now();setVisible(false)}
    if(!isNurse||!visible)return null;

    const hh=now.getHours(),mm=String(now.getMinutes()).padStart(2,'0');
    const win=data?.win||nssShiftWindow(now);
    const list=data?.next||[];
    const overdue=data?.overdue||[];
    const all=[...overdue,...list];
    // 2.18.20: the big left box is for MEDICINES only — one Guest at a time, late first, then by time.
    // 2.18.25: flip only late doses + doses due within 2 hours (if none, the next dose time); 5 s per card above 6 cards.
    const medAll=all.filter(x=>x.kind==='med').sort((a,b)=>(b.state==='overdue'?1:0)-(a.state==='overdue'?1:0)||a.at-b.at||nssRoomSort(a.patient).localeCompare(nssRoomSort(b.patient),undefined,{numeric:true}));
    const medSoon=medAll.filter(x=>x.state==='overdue'||x.at.getTime()<=now.getTime()+2*3600000);
    const medQueue=medSoon.length?medSoon:medAll.filter(x=>medAll[0]&&x.at.getTime()===medAll[0].at.getTime());
    const medLater=medAll.length-medQueue.length;
    const medSec=medQueue.length>6?5:7;
    const medIdx=medQueue.length>1?Math.floor(now.getTime()/1000/medSec)%medQueue.length:0;
    const hero=medQueue[medIdx]||null;
    const boxes=nssBuildBoxes(all.filter(x=>x.kind!=='med'));
    const overRest=overdue.filter(x=>x.kind!=='med');
    const firstOver=overRest[0];
    const heroLate=hero&&hero.state==='overdue';
    const fmtMins=n=>n>=60?`${Math.floor(n/60)}h ${n%60}m`:`${n} min`;
    const heroLateMins=heroLate?Math.max(1,Math.round((now-(hero.deadline||hero.at))/60000)):0;
    const overMins=firstOver?Math.max(1,Math.round((now-(firstOver.deadline||firstOver.at))/60000)):0;
    const signOutIn=Math.max(1,Math.round((30*60000-(Date.now()-lastActivity.current))/60000));
    const soon=hero&&hero.at.getTime()-now.getTime()<=10*60000;
    const medGuests=new Set(medAll.map(x=>x.patient?.id)).size;
    const medLateN=medAll.filter(x=>x.state==='overdue').length;
    const kinds=data?.byKind||{med:0,proc:0,care:0};

    return h('div',{className:'nss-overlay',role:'dialog','aria-modal':'true','aria-label':'Upcoming tasks — touch to continue',
      onClick:e=>{e.preventDefault();e.stopPropagation();close()},
      onPointerDown:e=>e.stopPropagation()},
      h('div',{className:'nss-inner'},
        h('header',{className:'nss-head'},
          h('div',{className:'nss-brand'},
            h('div',{className:'nss-logo'},h('img',{src:'./assets/samara-logo.png',alt:'Samara Assisted Living'})),
            h('div',null,
              h('div',{className:'nss-clock'},String(hh%12||12),h('span',{className:'nss-colon'},':'),mm,h('span',{className:'nss-sec'},':'+String(now.getSeconds()).padStart(2,'0')),h('small',null,hh<12?'AM':'PM')),
              h('div',{className:'nss-date'},`${now.toLocaleDateString('en-IN',{weekday:'long'})} · ${formatDateIN(nssLocalISO(now))}`))),
          h('div',{className:'nss-shift'},
            h('span',{className:'nss-chip'},win.name.replace(/\s*\(.*$/,''),h('span',{className:'nss-chip-hours'},` ${(win.name.match(/\((.*)\)/)||['',''])[1]}`)),
            h('span',{className:'nss-onduty'},'On duty: ',h('strong',null,profile.full_name||profile.name||'Nurse')))),
        firstOver&&h('div',{className:'nss-overdue',role:'status'},
          h('span',{className:'nss-overdue-tag'},`OVERDUE ${fmtMins(overMins)}`),
          h('span',{className:'nss-overdue-text'},h('strong',null,NSS_KIND_LABEL[firstOver.kind]),` · ${firstOver.title} · `,h('strong',null,firstOver.who)),
          overRest.length>1&&h('span',{className:'nss-overdue-more'},`+ ${overRest.length-1} more overdue`)),
        h('main',{className:'nss-main'},
          hero?h('section',{className:`nss-hero nss-hero-med${soon?' nss-soon':''}${heroLate?' nss-hero-late':''}`},
            h('div',{className:'nss-hero-top'},
              nssTag('med','Medication','med'),
              h('span',{className:`nss-count${heroLate?' late':''}`},heroLate?`Late ${fmtMins(heroLateMins)}`:nssCountdown(hero,now))),
            h('div',{className:'nss-med-meta'},[`${medGuests} Guest${medGuests===1?'':'s'} this shift`,medLateN?`${medLateN} late`:''].filter(Boolean).join(' · '),nssDots(medQueue.length,medIdx)),
            h('div',{className:'nss-flip nss-med-card',key:`m-${medIdx}-${hero.patient?.id}-${hero.at.getTime()}`},
              h('div',{className:'nss-med-row'},
                h('div',{className:'nss-hero-time'},nssTime12(hero.at).t,h('small',null,nssTime12(hero.at).ap)),
                h('div',{className:'nss-med-who'},
                  hero.room&&h('div',{className:'nss-hero-room'},hero.room),
                  h('div',{className:'nss-hero-who'},hero.name||hero.who))),
              h('ol',{className:`nss-hero-meds${(hero.meds||[]).length>6?' many':''}`},(hero.meds||[]).map((m,k)=>h('li',{key:k},
                h('b',null,m.name),
                m.sliding&&h('span',{className:'nss-med-warn'},'check sugar first'),
                (m.food||m.route)&&h('span',{className:'nss-med-food'},[m.route,m.food].filter(Boolean).join(' · ')))))),
            h('div',{className:'nss-hero-foot'},h('span',null,`${(hero.meds||[]).length} medicine${(hero.meds||[]).length===1?'':'s'}`),
              h('span',{style:{fontWeight:700,textAlign:'right'}},
                medQueue.length>1?`next: ${(()=>{const n=medQueue[(medIdx+1)%medQueue.length];return `${nssTime12(n.at).t} ${nssTime12(n.at).ap} · ${n.room||''}`})()}`:'',
                medLater>0&&h('span',{className:'nss-med-later'},`+ ${medLater} more dose${medLater===1?'':'s'} later this shift`))))
          :h('section',{className:'nss-hero nss-hero-med'},
            h('div',{className:'nss-hero-top'},nssTag('med','Medication','med')),
            h('div',{className:'nss-hero-title',style:{marginTop:'auto'}},!data&&!error?'Loading tasks…':error?'Tasks could not be loaded — touch to continue':'No medicines due'),
            h('div',{className:'nss-hero-who'},error?'Please check the internet connection.':'All medicines of this shift are given or none are scheduled.')),
          h('section',{className:'nss-list'},
            h('div',{className:'nss-list-head'},h('span',{className:'nss-label'},'COMING UP'),h('span',null,'by task')),
            data?.failed?.length>0&&h('div',{className:'nss-failed',role:'status'},`Could not read: ${data.failed.map(f=>`${f.name} (${String(f.message||'').slice(0,90)})`).join(', ')} — please check Shift Tasks.`),
            boxes.length?h('div',{className:'nss-boxes stack'},boxes.map((b,bi)=>{
              if(b.empty){
                const inHero=false;
                return h('div',{className:'nss-box empty',key:b.group},
                  h('div',{className:'nss-box-head'},nssTag(b.kind,b.label,b.group)),
                  h('div',{className:'nss-box-empty'},
                    h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2.4,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'},h('path',{d:'M5 12.5l4.2 4.2L19 7'})),
                    b.group==='care'?(!data?.careStats?.planned?'No care planned for this shift':'All care done this shift'):inHero?'Shown in Next Task':'Nothing due in the next 4 hours'));
              }
              // 2.18.17: Care is shift-based — all care of the shift scrolls bottom-to-top, one line each: care · room · name.
              if(b.group==='care'){
                const lines=b.entries;const scroll=lines.length>(boxes.length>3?3:5);
                const line=(e,k)=>h('div',{className:`nss-tick-line${e.late?' late':''}`,key:k},
                  e.late&&h('span',{className:'nss-late'},'Late'),
                  h('span',{className:'nss-tick-care'},e.detail),
                  h('span',{className:'nss-tick-sep'},'·'),
                  h('b',{className:'nss-tick-room'},e.room),
                  h('span',{className:'nss-tick-sep'},'·'),
                  h('span',{className:'nss-tick-name'},e.name),
                  e.usual&&h('span',{className:'nss-tick-usual'},'usual · no care plan'),
                  e.when&&e.when!=='Any time'&&h('span',{className:'nss-tick-when'},e.when));
                return h('div',{className:`nss-box nss-box-care${lines.some(e=>e.late)?' late':''}`,key:b.group},
                  h('div',{className:'nss-box-head'},nssTag(b.kind,b.label,b.group),data?.careStats?.noPlan>0&&h('span',{className:'nss-noplan'},`${data.careStats.noPlan} Guest${data.careStats.noPlan===1?'':'s'} without care plan`),h('span',{className:'nss-flip-count'},`${lines.length} this shift`)),
                  h('div',{className:'nss-box-meta'},b.meta.replace(/^\d+ · /,'').replace(/next Any time( · )?/,'')||'any time this shift'),
                  h('div',{className:`nss-tick${scroll?' run':''}`},
                    h('div',{className:'nss-tick-track',key:`t-${lines.length}-${lines.map(e=>e.room+e.detail).join('|').length}`,style:scroll?{animationDuration:`${Math.max(12,lines.length*2.8)}s`}:null},
                      lines.map((e,k)=>line(e,'a'+k)),
                      scroll&&lines.map((e,k)=>line(e,'b'+k)))));
              }
              const i=nssFlipIndex(b.entries.length,now,bi);const e=b.entries[i];
              return h('div',{className:`nss-box${e.late?' late':e.due?' due':''}`,key:b.group},
                h('div',{className:'nss-box-head'},nssTag(b.kind,b.label,b.group),h('span',{className:'nss-box-meta'},b.meta),nssDots(b.entries.length,i)),
                h('div',{className:'nss-flip nss-box-body',key:`${b.group}-${i}-${e.room}-${e.when}`},
                  h('div',{className:'nss-time'},h('b',null,e.when.replace(/\s?(AM|PM)$/,'')),h('span',null,(e.when.match(/(AM|PM)$/)||[''])[0]||(e.when==='Ready'?'now':''))),
                  h('div',{className:'nss-box-text'},
                    (e.late||e.due||e.detail)&&h('div',{className:'nss-box-detail'},
                      e.late&&h('span',{className:'nss-late'},'Late'),
                      e.awaiting&&h('span',{className:'nss-await'},'Awaiting approval'),
                      !e.late&&e.due&&h('span',{className:'nss-due'},'Due now'),
                      e.detail&&h('span',{className:`nss-box-detail-text${b.group==='med'?' meds':''}`},e.detail)),
                    e.room&&h('div',{className:'nss-box-room'},e.room),
                    e.name&&h('div',{className:'nss-box-name'},e.name))));
            }))
            :h('div',{className:'nss-empty'},data?'No other tasks in the next 4 hours.':'…'))),
        h('footer',{className:'nss-foot'},
          h('span',null,data?h(React.Fragment,null,'This shift: ',h('strong',null,`${data.done} of ${data.total}`),` tasks done · ${kinds.med||0} Medication · ${kinds.vitals||0} Vital Signs · ${kinds.proc||0} Procedure${kinds.proc===1?'':'s'} · ${kinds.meal||0} Meals · ${kinds.care||0} Care`):''),
          h('span',{className:'nss-touch'},'Touch anywhere to continue'),
          h('span',null,`Auto sign-out in ${signOutIn} min`,h('small',{className:'nss-ver'},` · v${typeof APP_VERSION!=='undefined'?APP_VERSION:''}`)))));
  }

  // 2.18.23: top-bar button (Nurse / Nursing Manager) to start the task screensaver now.
  function StartScreensaverButton({profile}){
    const allowed=profile?.role==='Nurse'||(typeof isNursingManagerProfile==='function'&&isNursingManagerProfile(profile));
    if(!allowed)return null;
    return h('button',{type:'button',className:'btn nss-start-btn',title:'Show upcoming tasks on screen',
      onClick:e=>{e.stopPropagation();setTimeout(()=>window.dispatchEvent(new Event('samara-start-screensaver')),60)}},
      h('svg',{viewBox:'0 0 24 24',width:18,height:18,fill:'none',stroke:'currentColor',strokeWidth:2.2,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':'true'},
        h('rect',{x:3,y:4,width:18,height:12,rx:2}),h('path',{d:'M8 20h8M12 16v4'})),
      'Start Screen Saver');
  }
