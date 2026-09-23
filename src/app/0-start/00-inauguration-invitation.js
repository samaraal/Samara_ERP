
(() => {

const SAMARA_INVITATION_END = new Date(2026, 8, 1, 0, 0, 0); // Visible through 31-Aug-2026; stops from 01-Sep-2026.
const SAMARA_INVITATION_SESSION_KEY = 'samara_erp_inauguration_aug2026_loginfix';

window.showSamaraInaugurationInvitation=function(){
  try{
    if(new Date() >= SAMARA_INVITATION_END)return;
    if(sessionStorage.getItem(SAMARA_INVITATION_SESSION_KEY)==='shown')return;
    if(document.getElementById('samara-inauguration-modal'))return;
    if(!document.body)return;

    if(!document.getElementById('samara-inauguration-style')){
      const style=document.createElement('style');
      style.id='samara-inauguration-style';
      style.textContent=`
        #samara-inauguration-modal{
          position:fixed;inset:0;z-index:2147483500;
          display:flex;align-items:center;justify-content:center;
          padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));
          background:rgba(38,16,29,.78);
          backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
          animation:samaraInviteFade .28s ease both;
        }
        #samara-inauguration-modal .samara-invite-card{
          position:relative;display:flex;align-items:center;justify-content:center;
          width:min(94vw,780px);height:min(92vh,1080px);
          border-radius:18px;overflow:hidden;background:#fff;
          box-shadow:0 28px 80px rgba(0,0,0,.38);
          animation:samaraInviteRise .35s ease both;
        }
        #samara-inauguration-modal img{
          display:block;max-width:100%;max-height:100%;
          width:auto;height:auto;object-fit:contain;background:#fff;
        }
        #samara-inauguration-modal .samara-invite-close{
          position:absolute;top:10px;right:10px;z-index:2;
          min-width:46px;height:46px;padding:0 13px;border:0;border-radius:999px;
          display:flex;align-items:center;justify-content:center;
          background:rgba(255,255,255,.96);color:#7a1247;
          box-shadow:0 5px 20px rgba(40,10,28,.22);
          font:800 28px/1 Arial,sans-serif;cursor:pointer;
          opacity:0;visibility:hidden;transform:scale(.88);
          transition:.2s ease;
        }
        #samara-inauguration-modal .samara-invite-close.ready{
          opacity:1;visibility:visible;transform:scale(1);
        }
        #samara-inauguration-modal .samara-invite-close:focus-visible{
          outline:3px solid #f08ab9;outline-offset:3px;
        }
        @keyframes samaraInviteFade{from{opacity:0}to{opacity:1}}
        @keyframes samaraInviteRise{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
        @media(max-width:600px){
          #samara-inauguration-modal{padding:8px}
          #samara-inauguration-modal .samara-invite-card{
            width:96vw;height:92dvh;border-radius:14px;
          }
          #samara-inauguration-modal .samara-invite-close{
            top:8px;right:8px;min-width:44px;height:44px;font-size:26px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const modal=document.createElement('div');
    modal.id='samara-inauguration-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Samara Assisted Living inauguration invitation');

    const card=document.createElement('div');
    card.className='samara-invite-card';

    const image=document.createElement('img');
    image.src='./assets/samara-inauguration-27-08-2026.png';
    image.alt='Invitation to the inauguration of Samara Assisted Living on 27 August 2026, Mogappair, Chennai';
    image.decoding='async';

    const close=document.createElement('button');
    close.type='button';
    close.className='samara-invite-close';
    close.setAttribute('aria-label','Close inauguration invitation');
    close.title='Close';
    close.textContent='×';

    const remove=()=>{
      modal.style.opacity='0';
      modal.style.transition='opacity .18s ease';
      window.setTimeout(()=>modal.remove(),190);
    };

    close.addEventListener('click',remove);
    document.addEventListener('keydown',function escHandler(event){
      if(event.key==='Escape'&&close.classList.contains('ready')){
        document.removeEventListener('keydown',escHandler);
        remove();
      }
    });

    card.append(image,close);
    modal.appendChild(card);
    document.body.appendChild(modal);
    sessionStorage.setItem(SAMARA_INVITATION_SESSION_KEY,'shown');

    window.setTimeout(()=>{
      if(document.body.contains(close)){
        close.classList.add('ready');
        close.focus({preventScroll:true});
      }
    },4000);
  }catch(error){
    console.warn('Samara inauguration invitation could not be displayed.',error);
  }
};

function initSamaraInaugurationInvitation(){
  // ERP invitation is triggered from the authenticated React session/profile state.
  // This keeps the sign-in screen clear and guarantees display after successful login.
}

  try {
    const doc = document;
    const root = doc.documentElement;

    root.classList.add('samara-preboot');

    if (!doc.getElementById('samara-preboot-style')) {
      const style = doc.createElement('style');
      style.id = 'samara-preboot-style';
      style.textContent = `
        html, body {
          margin: 0;
          min-height: 100%;
          background: #a91360 !important;
        }

        html.samara-preboot body {
          overflow: hidden;
        }

        html.samara-preboot #root {
          opacity: 0 !important;
          visibility: hidden !important;
        }

        #app-splash {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483000 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background:
            radial-gradient(circle at 100% 0%, rgba(255,255,255,.10) 0 130px, transparent 132px),
            radial-gradient(circle at 0% 100%, rgba(255,255,255,.10) 0 105px, transparent 107px),
            linear-gradient(135deg, #5d1039 0%, #d93679 100%) !important;
          opacity: 1 !important;
          visibility: visible !important;
          transition: opacity .38s ease, visibility .38s ease !important;
        }

        #app-splash.splash-ready {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        body.samara-app-ready #root {
          opacity: 1 !important;
          visibility: visible !important;
        }

        #root {
          min-height: 100vh;
          background: #fff5fa;
        }

        @media (prefers-reduced-motion: reduce) {
          #app-splash {
            transition: none !important;
          }
        }
  
      .employee-modal .modal-grid{align-items:start}
      .employee-address-block{
        margin-top:8px;
        padding:18px;
        border:1px solid #ecd0dd;
        border-radius:18px;
        background:linear-gradient(145deg,#fff 0%,#fff9fb 100%);
      }
      .employee-address-heading{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:14px;
        margin-bottom:14px;
      }
      .employee-address-heading h4{margin:0 0 3px;color:#5d1039}
      .employee-address-same{
        display:flex!important;
        align-items:center;
        gap:8px;
        min-height:40px;
        padding:8px 12px;
        border-radius:999px;
        background:#fdebf3;
        color:#7a1247;
        font-weight:800;
        white-space:nowrap;
      }
      .employee-address-same input{width:18px!important;height:18px!important;min-height:18px!important}
      .employee-address-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px 14px;
      }
      @media(max-width:760px){
  .patient-file-backdrop .patient-medication-tab{gap:9px!important;}
  .patient-file-backdrop .patient-medication-tab .section-card{padding:12px!important;}
  .patient-file-backdrop .patient-medication-tab .section-card h4{font-size:16px!important;margin-bottom:7px!important;}
  .patient-file-backdrop .patient-med-table{font-size:12px!important;}
  .patient-file-backdrop .patient-med-table th,.patient-file-backdrop .patient-med-table td{padding:8px!important;}
        .employee-address-heading{display:grid;grid-template-columns:1fr}
        .employee-address-same{width:100%;border-radius:13px;white-space:normal}
        .employee-address-grid{grid-template-columns:1fr}
        .employee-address-grid .span-2{grid-column:auto!important}
      }

    `;
      (doc.head || doc.documentElement).appendChild(style);
    }
  } catch (_error) {}
})();

