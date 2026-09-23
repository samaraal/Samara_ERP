  function ensureCompactDataEntryStyle(){
    if(document.getElementById('samara-compact-data-entry-style'))return;
    const style=document.createElement('style');
    style.id='samara-compact-data-entry-style';
    style.textContent=`
      .content .section-card{
        padding:14px 16px!important;
        margin-bottom:10px!important;
        border-radius:15px!important;
      }
      .content .section-card>h4,
      .content .section-title h4{
        margin:0 0 10px!important;
      }
      .content .section-title{
        margin-bottom:8px!important;
      }
      .content .form-grid,
      .content .modal-grid{
        gap:9px 12px!important;
      }
      .content .field{
        gap:3px!important;
      }
      .content .field label{
        margin-bottom:2px!important;
        line-height:1.2!important;
      }
      .content .field input:not([type="checkbox"]):not([type="radio"]),
      .content .field select{
        min-height:38px!important;
        height:38px;
        padding:7px 11px!important;
      }
      .content .field textarea{
        min-height:62px!important;
        padding:8px 11px!important;
        line-height:1.35!important;
      }
      .content .repeat-row{
        gap:8px 10px!important;
        padding:10px!important;
        margin:7px 0!important;
        border-radius:12px!important;
      }
      .content .check-grid{
        gap:8px!important;
        margin-bottom:9px!important;
      }
      .content .check-card{
        min-height:42px!important;
        padding:8px 11px!important;
        border-radius:10px!important;
      }
      .content .modal{
        padding:16px!important;
      }
      .content .panel-head{
        margin-bottom:10px!important;
      }
      .content .actions{
        margin-top:10px!important;
        gap:8px!important;
      }
      .content .btn{
        min-height:38px;
      }
      .admission-numbered-row{
        position:relative!important;
        padding:54px 12px 12px!important;
        margin-top:10px!important;
        border:1px solid #ead0de!important;
        border-radius:14px!important;
        background:linear-gradient(145deg,#ffffff,#fffafd)!important;
        column-gap:10px!important;
        row-gap:12px!important;
        align-items:end!important;
      }
      .admission-row-number{
        position:absolute!important;
        left:14px!important;
        top:10px!important;
        width:30px!important;
        height:30px!important;
        border-radius:50%!important;
        display:grid!important;
        place-items:center!important;
        background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c)!important;
        color:#fff!important;
        font-weight:900!important;
        line-height:1!important;
        z-index:2!important;
      }
      .admission-numbered-row>.field,
      .admission-numbered-row>.medication-time-field{
        min-width:0!important;
        width:100%!important;
      }
      .admission-numbered-row label{
        display:block!important;
        margin-bottom:6px!important;
        line-height:1.2!important;
        white-space:normal!important;
      }
      .admission-numbered-row input,
      .admission-numbered-row select,
      .admission-numbered-row textarea{
        width:100%!important;
        min-width:0!important;
      }
      .admission-numbered-row.care{
        grid-template-columns:minmax(210px,1.25fr) minmax(180px,.85fr) minmax(180px,.85fr) minmax(250px,1.5fr) auto!important;
      }
      @media(max-width:1050px){
        .admission-numbered-row.care{grid-template-columns:1fr 1fr!important}
        .admission-numbered-row.care>.btn{grid-column:1/-1;justify-self:end}
      }
      @media(max-width:700px){
        .admission-numbered-row{padding:52px 10px 10px!important}
        .admission-numbered-row.care{grid-template-columns:1fr!important}
      }
      .admission-locked-row{
        display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:start;
        padding:9px 2px;margin:0;border:0;border-bottom:1px solid #ead0de;
        border-radius:0;background:transparent
      }
      .admission-locked-row:last-of-type{border-bottom:0}
      .admission-locked-row .number{
        width:28px;height:28px;border-radius:50%;display:grid;place-items:center;
        background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c);color:#fff;font-weight:900;font-size:13px
      }
      .admission-locked-row .summary{display:grid;gap:2px;min-width:0;padding-top:2px}
      .admission-locked-row .summary strong{font-size:15px;line-height:1.3}
      .admission-locked-row .summary small{color:#7a1247;white-space:normal;line-height:1.35}
      .admission-row-actions{display:flex;gap:6px;flex-wrap:wrap;padding-top:1px}
      .admission-row-actions .btn{min-height:30px;padding:5px 10px;font-size:12px}
      .admission-add-bottom{
        display:flex;justify-content:flex-end;margin-top:10px;padding-top:8px;
        border-top:1px solid #eef3f1
      }
      .admission-error-toast{
        position:fixed;left:50%;bottom:28px;transform:translateX(-50%);
        z-index:100500;width:min(720px,calc(100vw - 28px));
        display:flex;align-items:flex-start;gap:12px;padding:14px 16px;
        border-radius:14px;background:#b42318;color:#fff;
        box-shadow:0 18px 42px rgba(91,19,15,.34);
        animation:admissionErrorToastIn .18s ease-out
      }
      .admission-error-toast .icon{
        flex:0 0 34px;width:34px;height:34px;display:grid;place-items:center;
        border-radius:50%;background:rgba(255,255,255,.18);
        font-weight:900;font-size:19px
      }
      .admission-error-toast strong{display:block;font-size:15px}
      .admission-error-toast span{display:block;margin-top:3px;color:#ffe7e4;font-size:13px;line-height:1.35}
      .admission-error-toast button{
        margin-left:auto;border:0;background:transparent;color:#fff;
        font-size:22px;cursor:pointer;line-height:1
      }
      @keyframes admissionErrorToastIn{
        from{opacity:0;transform:translate(-50%,12px)}
        to{opacity:1;transform:translate(-50%,0)}
      }
      .consent-status-banner{
        padding:12px 14px;border-radius:12px;background:#fff8e8;border:1px solid #efd18a;
        color:#754c00;font-weight:800;margin-bottom:10px
      }
      .consent-upload-panel{padding:12px;border:1px dashed #dda9c2;border-radius:12px;background:#f7fcfa}
      @media(max-width:700px){
        .admission-locked-row{grid-template-columns:36px 1fr}
        .admission-row-actions{grid-column:1/-1}
      }

.content .clinical-charge-note{
        grid-column:1/-1;
        padding:9px 11px;
        border:1px solid #b9dfd3;
        border-radius:10px;
        background:#edf9f5;
        color:#7a1247;
        font-size:12px;
        font-weight:800;
      }
      @media(max-width:700px){
        .content .section-card{padding:12px!important}
        .content .modal{padding:13px!important}
      }
    `;
    document.head.appendChild(style);
  }


