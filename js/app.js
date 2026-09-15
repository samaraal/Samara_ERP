
const WEBSITE_VERSION = "2.1.1";
const SAMARA_WHATSAPP = "917395961616";
const SAMARA_PHONE = "073959 61616";

/* Samara bilingual foundation — English / Tamil preview */
(function(){
  const STORAGE_KEY='samara_website_language';
  const originalText=new WeakMap();
  const HOME_TRANSLATIONS={
    'Home':'முகப்பு','About':'எங்களைப் பற்றி','Services':'சேவைகள்','Rooms':'அறைகள்','Packages':'பேக்கேஜ்கள்','Gallery':'படங்கள்','Careers':'வேலைவாய்ப்பு','FAQ':'கேள்விகள்','Contact':'தொடர்பு','Feedback':'கருத்துகள்','Admission Enquiry':'சேர்க்கை','Family Portal':'குடும்ப போர்டல்','Staff Login':'பணியாளர் உள்நுழைவு',
    'Samara Assisted Living':'சமரா அசிஸ்டெட் லிவிங்','Professional Post-Hospital & Step-Down Care':'மருத்துவமனை சிகிச்சைக்குப் பிந்தைய முழுமையான இடைக்காலப் பராமரிப்பு மையம்','24×7 Nursing Care':'24 மணி நேர செவிலியர் சேவை','Medical Supervision':'மருத்துவர் கண்காணிப்பு','Rehabilitation Support':'மறுவாழ்வு சிகிச்சை','Elder Care':'முதியோர் நலன்','A safe transition from hospital to home':'மருத்துவமனையிலிருந்து வீடு திரும்புவதற்கான பாதுகாப்பான இடைநிலை கவனிப்பு.','Care That Feels Like Family.':'சொந்தக் குடும்பம் தரும் அதே அன்பு மற்றும் அரவணைப்பு.','Chennai’s Digital Assisted Living Facility with Family Portal for transparent, connected care.':'நோயாளியின் நலம் குறித்த விவரங்களை உடனுக்குடன் அறிந்துகொள்ளும் இணையதள வசதியுடன் (Family Portal), சென்னையின் நவீன டிஜிட்டல் பராமரிப்பு மையம்.','Book a Visit':'நேரில் பார்வையிட முன்பதிவு','♥ 24×7 Nursing Care':'♥ 24 மணி நேர செவிலியர் சேவை','⚕ Doctor Supervision':'⚕ மருத்துவர் கண்காணிப்பு','⌂ Digital Family Portal':'⌂ Digital Family Portal','💊 Medication Safety':'💊 மருந்துப் பாதுகாப்பு','⚘ Physiotherapy':'⚘ பிசியோதெரபி','₹ Transparent Billing':'₹ வெளிப்படையான கட்டண விவரம்',
    'Safe. Respectful. Reassuring.':'பாதுகாப்பு. கண்ணியம். நம்பிக்கை.','A Home Where Medical Excellence Meets Compassionate Living, Supported By Smart Digital Care.':'சிறந்த மருத்துவத் தரமும் கனிவான அரவணைப்பும் இணையும் இல்லம் — நவீன டிஜிட்டல் பராமரிப்புடன்.','Medication Safety & Management':'மருந்துகள் மேலாண்மை & பாதுகாப்பு','Doctor Coordination & Clinical Monitoring':'மருத்துவர் ஒருங்கிணைப்பு & தொடர் கண்காணிப்பு','Physiotherapy & Rehabilitation':'இயன்முறை சிகிச்சை & மறுவாழ்வு ஆதரவு','Diet & Nutrition Planning':'சீரான உணவு & ஊட்டச்சத்து திட்டம்','Family Portal & Daily Updates':'குடும்பத்தினருக்கான இணைய வசதி & தினசரி நல விவரங்கள்',
    'A New Chapter Begins':'ஒரு புதிய அத்தியாயம் தொடங்குகிறது','Samara Assisted Living Inaugurated on 27.08.2026':'சமரா அசிஸ்டெட் லிவிங் 27.08.2026 அன்று திறந்து வைக்கப்பட்டது','Samara Assisted Living, Mogappair, Chennai, was formally inaugurated by':'சென்னை முகப்பேரில் அமைந்துள்ள சமரா அசிஸ்டெட் லிவிங் மையத்தை முறைப்படி திறந்து வைத்தவர்','Dr. S. Manivannan, Founder & Managing Director of Kauvery Hospitals':'காவேரி மருத்துவமனைகளின் நிறுவனர் & நிர்வாக இயக்குநர் டாக்டர் எஸ். மணிவண்ணன்','on 27 August 2026, in the presence of distinguished guests, eminent medical professionals, industry leaders and well-wishers.':'27 ஆகஸ்ட் 2026 அன்று சிறப்பு விருந்தினர்கள், புகழ்பெற்ற மருத்துவ நிபுணர்கள், தொழில்துறை தலைவர்கள் மற்றும் நலம் விரும்பிகள் முன்னிலையில் விழா நடைபெற்றது.','The occasion marked the beginning of Samara’s commitment to professional post-hospital and step-down care, 24×7 nursing support, rehabilitation and dignified elder care — with transparent, connected digital care for families.':'தொழில்முறை மருத்துவமனைக்குப் பிந்தைய மற்றும் Step-Down பராமரிப்பு, 24×7 நர்சிங் ஆதரவு, மறுவாழ்வு மற்றும் கண்ணியமான முதியோர் பராமரிப்பை குடும்பங்களுக்கான வெளிப்படையான Digital Care உடன் வழங்கும் சமராவின் அர்ப்பணிப்பின் தொடக்கமாக இந்நிகழ்வு அமைந்தது.','Now Open & Serving Residents':'தற்போது திறக்கப்பட்டுள்ளது — குடியிருப்பாளர்களுக்குச் சேவை வழங்குகிறோம்','Samara Assisted Living, Mogappair, Chennai':'சமரா அசிஸ்டெட் லிவிங், முகப்பேர், சென்னை','27 August 2026':'27 ஆகஸ்ட் 2026','Inauguration Ceremony':'திறப்பு விழா','Highlights from the inauguration of Samara Assisted Living.':'சமரா அசிஸ்டெட் லிவிங் திறப்பு விழாவின் சிறப்பு தருணங்கள்.','View Full Inauguration Gallery':'முழு திறப்பு விழா படத்தொகுப்பைக் காண்க',
    'Digital Care Advantage':'Digital Care சிறப்பு','Care you can truly trust — with transparency built in.':'வெளிப்படைத்தன்மையுடன் நீங்கள் நம்பக்கூடிய பராமரிப்பு.','Samara combines compassionate assisted living with digital care systems designed to keep families informed and connected.':'குடும்பங்கள் தொடர்ந்து தகவல் பெறவும் இணைந்திருக்கவும் உதவும் Digital Care அமைப்புடன் அன்பான Assisted Living சேவையை சமரா வழங்குகிறது.','First Digital':'முதல் Digital','Assisted Living':'Assisted Living','Facility':'மையம்','Compassionate resident care strengthened by digital documentation, monitoring and coordinated care workflows.':'Digital பதிவுகள், கண்காணிப்பு மற்றும் ஒருங்கிணைந்த பராமரிப்பு நடைமுறைகளால் வலுப்படுத்தப்பட்ட அன்பான குடியிருப்பாளர் பராமரிப்பு.','First Facility With':'Family Portal கொண்ட முதல்','Portal':'மையம்','Authorised family members can follow approved aspects of resident care with timely updates and better continuity.':'அங்கீகரிக்கப்பட்ட குடும்ப உறுப்பினர்கள், குடியிருப்பாளரின் பராமரிப்பு குறித்த அனுமதிக்கப்பட்ட தகவல்களை சரியான நேரத்தில் தொடர்ந்து அறிந்துகொள்ளலாம்.','Monitor Resident Care':'குடியிருப்பாளர் பராமரிப்பைக் கண்காணிக்க','Ensure Transparency':'வெளிப்படைத்தன்மையை உறுதிசெய்ய',
    'Why Samara':'ஏன் சமரா?','Care planned around the person, not just the condition.':'உடல்நிலையை மட்டும் அல்லாமல், ஒவ்வொருவரையும் மையமாகக் கொண்ட பராமரிப்பு.','Every resident receives an individual care approach based on health needs, independence level and family expectations.':'உடல்நிலைத் தேவைகள், சுயசார்பு நிலை மற்றும் குடும்பத்தின் எதிர்பார்ப்புகளின் அடிப்படையில் ஒவ்வொரு குடியிருப்பாளருக்கும் தனிப்பட்ட பராமரிப்பு வழங்கப்படுகிறது.','Compassionate Assistance':'அன்பான தினசரி உதவி','Support with bathing, dressing, feeding, toileting, mobility and everyday routines.':'குளியல், உடை அணிதல், உணவு, கழிப்பறை உதவி, நடமாட்டம் மற்றும் தினசரி செயல்களில் ஆதரவு.','Clinical Coordination':'மருத்துவ ஒருங்கிணைப்பு','Medication support, vitals, doctor visits, hospital coordination and documented care.':'மருந்து உதவி, Vital Signs, டாக்டர் பார்வை, மருத்துவமனை ஒருங்கிணைப்பு மற்றும் பதிவு செய்யப்பட்ட பராமரிப்பு.','Comfortable Living':'வசதியான தங்குமிடம்','Private, twin-sharing and triple-sharing accommodation for different preferences and care requirements.':'விருப்பம் மற்றும் பராமரிப்புத் தேவைக்கேற்ப Private, Twin-Sharing மற்றும் Triple-Sharing தங்குமிடங்கள்.',
    'Who May Benefit?':'யாருக்கு ஏற்றது?','When home care is no longer enough—but hospital care is not required.':'வீட்டுப் பராமரிப்பு போதாமலும், மருத்துவமனை சிகிச்சை தேவையில்லாத நிலையிலும்.','Samara supports elderly persons living alone, residents recovering after hospital discharge and families seeking respite or continuing assistance.':'தனியாக வாழும் முதியவர்கள், மருத்துவமனையிலிருந்து வீடு திரும்பிய பின் குணமடைந்து வருபவர்கள் மற்றும் குறுகியகால அல்லது தொடர்ச்சியான உதவி தேடும் குடும்பங்களுக்கு சமரா ஆதரவளிக்கிறது.','Explore Services':'சேவைகளைப் பார்க்க','Elderly persons needing daily assistance or companionship':'தினசரி உதவி அல்லது துணை தேவைப்படும் முதியவர்கள்','Post-operative and post-hospital recovery residents':'அறுவை சிகிச்சை அல்லது மருத்துவமனை சிகிச்சைக்குப் பின் குணமடைந்து வருபவர்கள்','Persons needing supervised medication administration':'மேற்பார்வையுடன் மருந்து வழங்கல் தேவைப்படுபவர்கள்','Residents requiring physiotherapy and mobility support':'பிசியோதெரபி மற்றும் நடமாட்ட உதவி தேவைப்படும் குடியிருப்பாளர்கள்','Families seeking short-stay, respite or long-term care':'குறுகியகால, Respite அல்லது நீண்டகால பராமரிப்பு தேடும் குடும்பங்கள்',
    'Care at a Glance':'பராமரிப்பு — ஒரு பார்வையில்','Support across daily living, recovery and family communication.':'தினசரி வாழ்க்கை, குணமடைதல் மற்றும் குடும்பத் தகவல் தொடர்பில் முழுமையான ஆதரவு.','Care Support':'பராமரிப்பு ஆதரவு','Room Categories':'அறை வகைகள்','Flexible Package Types':'நெகிழ்வான பேக்கேஜ்கள்','Integrated Care Team':'ஒருங்கிணைந்த பராமரிப்புக் குழு',
    'Stay Connected Anywhere':'எங்கிருந்தும் தொடர்பில் இருங்கள்','Secure access for registered family members to approved care information and updates.':'பதிவுசெய்யப்பட்ட குடும்ப உறுப்பினர்கள் அனுமதிக்கப்பட்ட பராமரிப்புத் தகவல்கள் மற்றும் புதுப்பிப்புகளை பாதுகாப்பாகப் பார்க்கலாம்.','Smart Digital Care':'Smart Digital Care','Authorised family members can securely follow their loved one\'s wellbeing and important care information from anywhere.':'அங்கீகரிக்கப்பட்ட குடும்ப உறுப்பினர்கள் தங்கள் அன்புக்குரியவரின் நலநிலை மற்றும் முக்கிய பராமரிப்புத் தகவல்களை எங்கிருந்தும் பாதுகாப்பாக அறிந்துகொள்ளலாம்.','Daily Care Updates':'தினசரி பராமரிப்புத் தகவல்கள்','Medication Information':'மருந்து விவரங்கள்','Vitals & Clinical Summary':'Vital Signs & மருத்துவச் சுருக்கம்','Physiotherapy Progress':'பிசியோதெரபி முன்னேற்றம்','Billing & Receipts':'கட்டண விவரம் & ரசீதுகள்','Secure Documents':'பாதுகாப்பான ஆவணங்கள்','Open Family Portal':'Family Portal-ஐ திறக்க',
    ', on 27 August 2026, in the presence of distinguished guests, eminent medical professionals, industry leaders and well-wishers.':', 27 ஆகஸ்ட் 2026 அன்று சிறப்பு விருந்தினர்கள், புகழ்பெற்ற மருத்துவ நிபுணர்கள், தொழில்துறை தலைவர்கள் மற்றும் நலம் விரும்பிகள் முன்னிலையில் விழா நடைபெற்றது.',
    'Dr. S. Manivannan inaugurating Samara Assisted Living':'சமரா அசிஸ்டெட் லிவிங் மையத்தைத் திறந்து வைக்கும் டாக்டர் எஸ். மணிவண்ணன்','Shri. K. Rethinam inaugurating the Second Floor':'இரண்டாவது தளத்தைத் திறந்து வைக்கும் திரு. கே. ரெத்தினம்','Website launch by Shri. Adv. Elambharathi':'இணையதளத்தைத் தொடங்கி வைக்கும் வழக்கறிஞர் திரு. இளம்பாரதி','Dignitaries at the inauguration':'திறப்பு விழாவில் சிறப்பு விருந்தினர்கள்','Traditional lamp lighting – Dr. S. Thirunavukkarasu':'பாரம்பரிய குத்துவிளக்கேற்றுதல் – டாக்டர் எஸ். திருநாவுக்கரசு','Traditional lamp lighting – Dr. Uma Balamuruga':'பாரம்பரிய குத்துவிளக்கேற்றுதல் – டாக்டர் உமா பாலமுருகா','Dr. S. Manivannan addressing the gathering':'விழாவில் உரையாற்றும் டாக்டர் எஸ். மணிவண்ணன்','Chief Guest’s address':'சிறப்பு விருந்தினரின் உரை','Dr. S. Manivannan sharing lighter moments with Boomi R':'பூமி ஆர் உடன் மகிழ்ச்சியான தருணங்களைப் பகிரும் டாக்டர் எஸ். மணிவண்ணன்','Thiru. Boomi R welcoming the dignitaries':'சிறப்பு விருந்தினர்களை வரவேற்கும் திரு. பூமி ஆர்','Felicitation':'பாராட்டு நிகழ்வு','Mr. Sakithya Ram honouring Shri. M. M. Abdulla, M.P.':'நாடாளுமன்ற உறுப்பினர் திரு. எம். எம். அப்துல்லாவை கௌரவிக்கும் திரு. சாகித்ய ராம்','Shri. K. Rethinam with Dr. S. Manivannan':'டாக்டர் எஸ். மணிவண்ணனுடன் திரு. கே. ரெத்தினம்','Mr. Sakithya Ram & Dr. Maneesha Boominathan honouring Dr. S. Manivannan':'டாக்டர் எஸ். மணிவண்ணனை கௌரவிக்கும் திரு. சாகித்ய ராம் மற்றும் டாக்டர் மனீஷா பூமிநாதன்','Shri. G. Manivannan addressing the gathering':'விழாவில் உரையாற்றும் திரு. ஜி. மணிவண்ணன்','Traditional welcome to Dr. Anbarasan by Directors of Samara Health Care LLP, Dr. Chellaboomi & Dr. Maneesha Boominathan':'சமரா ஹெல்த் கேர் LLP இயக்குநர்கள் டாக்டர் செல்லபூமி மற்றும் டாக்டர் மனீஷா பூமிநாதன், டாக்டர் அன்பரசனை பாரம்பரிய முறையில் வரவேற்கின்றனர்','Dr. Maneesha Boominathan honouring Industrialist Shri. K. Rethinam Thondaiman':'தொழிலதிபர் திரு. கே. ரெத்தினம் தொண்டைமானை கௌரவிக்கும் டாக்டர் மனீஷா பூமிநாதன்','Ms. Viji Vasu, Ms. Gomathi and Ms. Raji welcoming the guests':'விருந்தினர்களை வரவேற்கும் திருமதி விஜி வாசு, திருமதி கோமதி மற்றும் திருமதி ராஜி',
    'Family':'குடும்ப','Compassion • Comfort • Dignity':'அன்பு • ஆறுதல் • கண்ணியம்','Explore':'மேலும் அறிய','Connect':'தொடர்புகள்','Legal':'சட்ட தகவல்கள்','Privacy Policy':'தனியுரிமைக் கொள்கை','Terms of Use':'பயன்பாட்டு விதிமுறைகள்','Medical Disclaimer':'மருத்துவ மறுப்பு அறிவிப்பு','Samara Health Care LLP. All rights reserved.':'சமரா ஹெல்த் கேர் LLP. அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.','Public Website v2.3.6':'பொது இணையதளம் v2.3.6','Developed and Maintained by:':'உருவாக்கி பராமரிப்பவர்:','. Mobile:':'. கைப்பேசி:'
  };

  function isHomePage(){
    const path=(location.pathname||'').toLowerCase();
    return path==='/'||path.endsWith('/index.html');
  }

  function translateHomePage(language){
    if(!isHomePage())return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];let node;
    while((node=walker.nextNode()))nodes.push(node);
    nodes.forEach(function(textNode){
      const parent=textNode.parentElement;
      if(!parent||parent.closest('script,style,[data-samara-language],#samara-tamil-preview-notice'))return;
      if(!originalText.has(textNode))originalText.set(textNode,textNode.nodeValue);
      const english=originalText.get(textNode);
      if(language!=='ta'){textNode.nodeValue=english;return;}
      const clean=english.trim();
      const translated=parent.getAttribute('data-tamil')||HOME_TRANSLATIONS[clean];
      if(!translated)return;
      const leading=(english.match(/^\s*/)||[''])[0];
      const trailing=(english.match(/\s*$/)||[''])[0];
      textNode.nodeValue=leading+translated+trailing;
    });
    document.title=language==='ta'?'சமரா அசிஸ்டெட் லிவிங் | முதியோர் மற்றும் குணமடைதல் பராமரிப்பு':'Samara Assisted Living | Elder Care & Recovery Support';
  }

  function preferredLanguage(){
    try{return localStorage.getItem(STORAGE_KEY)==='ta'?'ta':'en';}
    catch(_error){return 'en';}
  }

  function setLanguage(language){
    const selected=language==='ta'?'ta':'en';
    document.documentElement.lang=selected==='ta'?'ta':'en-IN';
    document.querySelectorAll('[data-samara-language]').forEach(function(button){
      const active=button.getAttribute('data-samara-language')===selected;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
    const notice=document.getElementById('samara-tamil-preview-notice');
    if(notice)notice.hidden=selected!=='ta';
    document.querySelectorAll('.inauguration-copy-english').forEach(function(section){section.hidden=selected==='ta';});
    document.querySelectorAll('.inauguration-copy-tamil').forEach(function(section){section.hidden=selected!=='ta';});
    document.querySelectorAll('[data-samara-tamil-only]').forEach(function(element){element.hidden=selected!=='ta';});
    translateHomePage(selected);
    try{localStorage.setItem(STORAGE_KEY,selected);}catch(_error){}
  }

  function createLanguageControls(){
    if(!document.body||document.getElementById('samara-language-bar'))return;
    const bar=document.createElement('div');
    bar.id='samara-language-bar';
    bar.className='samara-language-bar';
    bar.setAttribute('aria-label','Website language');
    bar.innerHTML='<div class="container samara-language-inner"><span class="samara-language-label">Language</span><div class="samara-language-switch" role="group" aria-label="Choose website language"><button type="button" data-samara-language="en">English</button><button type="button" data-samara-language="ta">தமிழ் <small>Preview</small></button></div></div>';

    const notice=document.createElement('div');
    notice.id='samara-tamil-preview-notice';
    notice.className='samara-tamil-preview-notice';
    notice.hidden=true;
    notice.setAttribute('role','status');
    notice.innerHTML='<div class="container"><strong>தமிழ் பதிப்பு உருவாக்கத்தில் உள்ளது.</strong><span> மொழிபெயர்ப்பு சரிபார்ப்பு நடைபெற்று வருகிறது. தற்போது சில உள்ளடக்கங்கள் ஆங்கிலத்தில் காணப்படலாம்.</span><small>Tamil version is under construction. Translation review is in progress.</small></div>';

    const header=document.querySelector('header.header');
    if(header){
      header.insertAdjacentElement('beforebegin',bar);
      header.insertAdjacentElement('afterend',notice);
    }else{
      document.body.insertAdjacentElement('afterbegin',bar);
      bar.insertAdjacentElement('afterend',notice);
    }

    bar.querySelectorAll('[data-samara-language]').forEach(function(button){
      button.addEventListener('click',function(){setLanguage(button.getAttribute('data-samara-language'));});
    });
    setLanguage(preferredLanguage());
    setTimeout(function(){setLanguage(preferredLanguage());},300);
    setTimeout(function(){setLanguage(preferredLanguage());},1200);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',createLanguageControls);
  else createLanguageControls();
})();


const SAMARA_INVITATION_END = new Date(2026, 8, 1, 0, 0, 0); // Visible through 31-Aug-2026; stops from 01-Sep-2026.
const SAMARA_INVITATION_SESSION_KEY = 'samara_grand_opening_invitation_aug2026_v10';
const SAMARA_GRAND_BANNER_MS = 9000; // Grand Opening stage stays on screen for 9 seconds.
const SAMARA_INVITATION_SCROLL_MS = 24000; // Invitation gently scrolls through the full screen.

function showSamaraInaugurationInvitation(){
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
          position:fixed;inset:0;z-index:2147483500;overflow:hidden;
          background:#4a1708;animation:samaraInviteFade .45s ease both;
        }
        #samara-inauguration-modal .samara-opening-stage{position:absolute;inset:0;overflow:hidden}
        #samara-inauguration-modal .samara-opening-banner{
          position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;
          overflow:hidden;padding:clamp(12px,2vw,28px);
          background:
            radial-gradient(circle at 50% 38%,rgba(255,255,224,.92) 0%,rgba(255,224,120,.82) 19%,transparent 44%),
            radial-gradient(circle at 50% 55%,#f7ce65 0%,#d99a22 52%,#8b500a 100%);
          box-shadow:inset 0 0 120px rgba(88,37,0,.32);
          transition:opacity 1.15s ease,visibility 1.15s ease;
        }
        #samara-inauguration-modal .samara-opening-banner.banner-done{opacity:0;visibility:hidden;pointer-events:none}
        #samara-inauguration-modal .samara-grand-banner-art{
          position:absolute;left:50%;top:50%;z-index:4;width:auto!important;height:auto!important;max-width:100vw!important;max-height:100dvh!important;display:block;object-fit:contain!important;object-position:center center;transform:translate(-50%,-50%);
          background:#8b500a;filter:saturate(1.02) contrast(1.01);
        }
        #samara-inauguration-modal .samara-grand-banner-art.mobile{display:none!important}
        #samara-inauguration-modal .samara-opening-banner::before{
          content:'';position:absolute;inset:2.2%;border:2px solid rgba(255,242,177,.82);border-radius:26px;
          box-shadow:inset 0 0 0 4px rgba(130,39,26,.18),0 0 36px rgba(255,221,117,.25);pointer-events:none
        }
        #samara-inauguration-modal .samara-opening-banner::after{
          content:'';position:absolute;left:5%;right:5%;bottom:4%;height:9px;
          background:repeating-linear-gradient(90deg,#7d153a 0 18px,#f8d274 18px 25px,transparent 25px 36px);
          opacity:.62;border-radius:999px
        }
        #samara-inauguration-modal .samara-curtain{
          position:absolute;top:0;bottom:0;width:53%;z-index:10;pointer-events:none;
          background:
            linear-gradient(90deg,rgba(255,255,255,.08),transparent 18%,rgba(0,0,0,.12) 35%,rgba(255,255,255,.08) 52%,rgba(0,0,0,.19) 72%,rgba(255,255,255,.08)),
            repeating-linear-gradient(90deg,#640723 0 8%,#a80d43 8% 17%,#73062a 17% 26%);
          box-shadow:inset 0 0 55px rgba(255,206,92,.2),0 0 45px rgba(48,0,15,.45);
          transition:transform 4.8s cubic-bezier(.52,.02,.18,1);
        }
        #samara-inauguration-modal .samara-curtain::after{
          content:'';position:absolute;top:0;bottom:0;width:14px;background:linear-gradient(#ffe6a0,#b67a18,#f8d26f,#8d5a0b,#ffe6a0)
        }
        #samara-inauguration-modal .samara-curtain.left{left:0}.samara-curtain.right{right:0}
        #samara-inauguration-modal .samara-curtain.left::after{right:0} #samara-inauguration-modal .samara-curtain.right::after{left:0}
        #samara-inauguration-modal .samara-opening-banner.curtains-open .samara-curtain.left{transform:translateX(-96%)}
        #samara-inauguration-modal .samara-opening-banner.curtains-open .samara-curtain.right{transform:translateX(96%)}
        #samara-inauguration-modal .samara-toran{
          position:absolute;top:2%;left:50%;transform:translateX(-50%);z-index:3;width:min(94vw,1200px);
          text-align:center;color:#7c1238;font-size:clamp(20px,3.2vw,42px);letter-spacing:.2em;
          filter:drop-shadow(0 3px 3px rgba(255,235,162,.55));white-space:nowrap
        }
        #samara-inauguration-modal .samara-grand-panel{
          position:relative;z-index:4;width:min(92vw,1120px);min-height:min(82dvh,820px);
          display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
          padding:clamp(24px,4vw,58px) clamp(16px,4vw,56px);
          border:2px solid rgba(122,25,55,.38);border-radius:clamp(18px,3vw,36px);
          background:linear-gradient(180deg,rgba(255,249,218,.70),rgba(255,223,130,.40));
          box-shadow:0 32px 88px rgba(84,35,0,.32),inset 0 0 42px rgba(255,255,255,.25);
          animation:samaraGrandArrive 1.25s cubic-bezier(.16,.9,.26,1.15) both;
        }
        #samara-inauguration-modal .samara-banner-logo{
          display:block;width:min(70vw,500px);max-height:25vh;object-fit:contain;margin:0 auto clamp(6px,1.3vh,14px);
          filter:drop-shadow(0 7px 14px rgba(95,23,48,.16));
        }
        #samara-inauguration-modal .samara-vanakkam{
          font:700 clamp(18px,2.2vw,29px)/1.2 Georgia,'Times New Roman',serif;color:#7c143b;
          letter-spacing:.08em;margin-bottom:clamp(8px,1.5vh,16px)
        }
        #samara-inauguration-modal .samara-grand-word{
          font:800 clamp(48px,9.6vw,124px)/.9 Georgia,'Times New Roman',serif;color:#7b1038;
          letter-spacing:.035em;text-transform:uppercase;text-shadow:0 2px 0 #f6d875,0 5px 0 rgba(95,37,0,.18),0 12px 28px rgba(76,28,0,.28)
        }
        #samara-inauguration-modal .samara-opening-word{
          margin-top:clamp(8px,1vh,14px);font:800 clamp(30px,5.8vw,72px)/1 Georgia,'Times New Roman',serif;
          color:#8d153f;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 3px 16px rgba(88,34,0,.22)
        }
        #samara-inauguration-modal .samara-grand-date{
          margin-top:clamp(20px,3vh,36px);padding:clamp(10px,1.4vw,16px) clamp(24px,4vw,52px);
          border:2px solid rgba(130,27,56,.34);border-radius:999px;background:rgba(126,20,56,.92);
          font:800 clamp(27px,4.4vw,54px)/1 Georgia,'Times New Roman',serif;color:#ffe59a;letter-spacing:.06em;
          box-shadow:0 8px 22px rgba(95,34,0,.22),inset 0 0 0 2px rgba(255,220,120,.22)
        }
        #samara-inauguration-modal .samara-grand-sub{
          margin-top:clamp(15px,2.4vh,26px);font:600 clamp(14px,1.6vw,20px)/1.35 Georgia,'Times New Roman',serif;
          color:#731136;letter-spacing:.04em
        }
        #samara-inauguration-modal .samara-countdown{
          margin-top:clamp(12px,2vh,20px);font:600 clamp(12px,1.3vw,16px)/1 Arial,sans-serif;color:#784318;
          letter-spacing:.08em;text-transform:uppercase
        }
        #samara-inauguration-modal .samara-kuthu{
          position:absolute;z-index:5;bottom:4%;width:clamp(90px,14vw,190px);height:clamp(170px,27vw,350px);
          opacity:.96;filter:drop-shadow(0 12px 12px rgba(74,39,0,.22));pointer-events:none
        }
        #samara-inauguration-modal .samara-kuthu.left{left:2.2%}.samara-kuthu.right{right:2.2%;transform:scaleX(-1)}
        #samara-inauguration-modal .samara-kuthu::before{
          content:'';position:absolute;left:45%;bottom:0;width:10%;height:64%;border-radius:50% 50% 16% 16%;
          background:linear-gradient(90deg,#7a4a09,#ffd777 35%,#9d6612 65%,#f4c55a);box-shadow:0 0 0 2px rgba(119,73,5,.25)
        }
        #samara-inauguration-modal .samara-kuthu::after{
          content:'🪔';position:absolute;left:50%;top:0;transform:translateX(-50%);font-size:clamp(70px,11vw,145px);line-height:1;
          filter:saturate(.75) sepia(.12)
        }
        #samara-inauguration-modal .samara-invite-scroll-stage{
          position:absolute;inset:0;z-index:2;overflow:hidden;display:none;align-items:flex-start;justify-content:center;
          background:radial-gradient(circle at 50% 20%,#fff8eb 0%,#f6ead7 55%,#d7b576 100%)
        }
        #samara-inauguration-modal .samara-invite-scroll-stage.ready{display:flex}
        #samara-inauguration-modal .samara-invite-card{
          position:absolute;top:100dvh;left:50%;width:min(100vw,980px);transform:translateX(-50%);
          background:#fff7f7;box-shadow:0 18px 70px rgba(69,24,0,.36);will-change:transform;
        }
        #samara-inauguration-modal .samara-invite-card.scrolling{
          animation:samaraInvitationScroll ${SAMARA_INVITATION_SCROLL_MS}ms linear forwards
        }
        #samara-inauguration-modal .samara-invite-card img{display:block;width:100%;height:auto}
        #samara-inauguration-modal .samara-scroll-note{
          position:fixed;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:6;
          padding:8px 14px;border-radius:999px;background:rgba(106,16,51,.88);color:#fff4d0;
          font:600 clamp(11px,1.2vw,14px)/1 Arial,sans-serif;letter-spacing:.04em;box-shadow:0 6px 20px rgba(0,0,0,.2);
          opacity:0;transition:opacity .4s ease;pointer-events:none
        }
        #samara-inauguration-modal .samara-invite-scroll-stage.ready .samara-scroll-note{opacity:1}
        @keyframes samaraInviteFade{from{opacity:0}to{opacity:1}}
        @keyframes samaraGrandArrive{0%{opacity:0;transform:translateY(28px) scale(.93)}75%{opacity:1;transform:translateY(-4px) scale(1.008)}100%{opacity:1;transform:none}}
        @keyframes samaraInvitationScroll{
          from{transform:translate(-50%,0)}
          to{transform:translate(-50%,calc(-100% - 100dvh))}
        }
        @media(max-width:600px){
          #samara-inauguration-modal .samara-grand-banner-art.desktop{display:none!important}
          #samara-inauguration-modal .samara-grand-banner-art.mobile{display:block!important;max-width:100vw!important;max-height:100dvh!important}
          #samara-inauguration-modal .samara-grand-panel{width:94vw;min-height:80dvh;padding:30px 14px 25px}
          #samara-inauguration-modal .samara-banner-logo{width:min(82vw,430px);max-height:21vh}
          #samara-inauguration-modal .samara-opening-word{letter-spacing:.08em}
          #samara-inauguration-modal .samara-kuthu{width:88px;height:170px;bottom:2%;opacity:.8}
          #samara-inauguration-modal .samara-invite-card{width:100vw}
          #samara-inauguration-modal .samara-scroll-note{font-size:10px;padding:7px 11px}
        }
        @media(prefers-reduced-motion:reduce){
          #samara-inauguration-modal .samara-curtain{transition-duration:.5s}
          #samara-inauguration-modal .samara-invite-card.scrolling{animation-duration:12000ms}
        }
      `;
      document.head.appendChild(style);
    }

    const modal=document.createElement('div');
    modal.id='samara-inauguration-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Samara Assisted Living grand opening presentation and inauguration invitation');

    const stage=document.createElement('div');
    stage.className='samara-opening-stage';

    const banner=document.createElement('div');
    banner.className='samara-opening-banner';
    banner.innerHTML=`
      <img class="samara-grand-banner-art desktop" src="./assets/samara-grand-opening-banner-27-08-2026.png?v=20260811-v10" alt="Samara Assisted Living Grand Opening on 27 August 2026">
      <img class="samara-grand-banner-art mobile" src="./assets/samara-grand-opening-banner-mobile-27-08-2026.png?v=20260811-v10" alt="Samara Assisted Living Grand Opening on 27 August 2026">
      <div class="samara-curtain left" aria-hidden="true"></div><div class="samara-curtain right" aria-hidden="true"></div>`;

    const scrollStage=document.createElement('div');
    scrollStage.className='samara-invite-scroll-stage';

    const card=document.createElement('div');
    card.className='samara-invite-card';
    const image=document.createElement('img');
    image.src='./assets/samara-inauguration-27-08-2026.png?v=20260812-v8';
    image.alt='Invitation to the inauguration of Samara Assisted Living on 27 August 2026, Mogappair, Chennai';
    image.decoding='async';
    card.appendChild(image);

    const note=document.createElement('div');
    note.className='samara-scroll-note';
    note.textContent='Inauguration Invitation';
    scrollStage.append(card,note);
    stage.append(banner,scrollStage);
    modal.appendChild(stage);
    document.body.appendChild(modal);
    sessionStorage.setItem(SAMARA_INVITATION_SESSION_KEY,'shown');

    // Slowly part the ceremonial curtains while the 9-second Grand Opening stage remains visible.
    window.setTimeout(()=>banner.classList.add('curtains-open'),700);

    // After 9 seconds, the invitation enters from below and gently scrolls upward through the full screen.
    window.setTimeout(()=>{
      scrollStage.classList.add('ready');
      requestAnimationFrame(()=>requestAnimationFrame(()=>card.classList.add('scrolling')));
      banner.classList.add('banner-done');
    },SAMARA_GRAND_BANNER_MS);

    // Once the invitation has fully passed, close the entire presentation automatically and reveal the website.
    window.setTimeout(()=>{
      modal.style.opacity='0';
      modal.style.transition='opacity .85s ease';
      window.setTimeout(()=>modal.remove(),900);
    },SAMARA_GRAND_BANNER_MS + SAMARA_INVITATION_SCROLL_MS + 350);
  }catch(error){
    console.warn('Samara inauguration invitation could not be displayed.',error);
  }
}

function initSamaraInaugurationInvitation(){
  // Do not show the inauguration presentation on the Careers application page.
  const pagePath=(window.location.pathname||'').toLowerCase().replace(/\/+$/,'');
  if(pagePath.endsWith('/careers.html'))return;
  window.setTimeout(showSamaraInaugurationInvitation,500);
}


// v1.8.0 — iPhone / Android navigation and secure entry-point polish.
const SAMARA_ERP_URL = "https://app.samaraassistedliving.com/?source=website&v=2.8.32";
const SAMARA_FAMILY_URL = "https://family.samaraassistedliving.com";

// Always direct every public-site Staff Login link to the same live ERP root.
document.querySelectorAll('a[href*="app.samaraassistedliving.com"]').forEach(link => {
  link.href = SAMARA_ERP_URL;
  link.removeAttribute("target");
  link.setAttribute("aria-label", "Staff Login – Samara Care ERP");
});

// Keep every Family Portal link on the current custom domain.
document.querySelectorAll('a[href*="family.samaraassistedliving.com"]').forEach(link => {
  link.href = SAMARA_FAMILY_URL;
});

// On phones, Staff Login remains visible even when the main navigation is collapsed.
(() => {
  const headerInner = document.querySelector(".header .header-inner");
  const menuButton = headerInner?.querySelector(".menu-button");
  if (!headerInner || !menuButton || headerInner.querySelector(".mobile-staff-login")) return;

  const staff = document.createElement("a");
  staff.className = "mobile-staff-login";
  staff.href = SAMARA_ERP_URL;
  staff.textContent = "Staff Login";
  staff.setAttribute("aria-label", "Open Samara Care ERP Staff Login");
  headerInner.insertBefore(staff, menuButton);
})();

// Close the mobile menu after tapping outside it.
document.addEventListener("click", event => {
  if (!nav?.classList.contains("open")) return;
  const header = document.querySelector(".header");
  if (header && !header.contains(event.target)) {
    nav.classList.remove("open");
    menu?.setAttribute("aria-expanded", "false");
  }
});


// Add Careers to the public navigation on every page.
const contactNavLink = [...document.querySelectorAll(".nav a")]
  .find(link => link.getAttribute("href") === "./contact.html");
if (contactNavLink && !document.querySelector('.nav a[href="./careers.html"]')) {
  const careersLink = document.createElement("a");
  careersLink.href = "./careers.html";
  careersLink.textContent = "Careers";
  if (location.pathname.endsWith("/careers.html")) careersLink.classList.add("active");
  contactNavLink.insertAdjacentElement("afterend", careersLink);
}

const menu = document.querySelector(".menu-button");
const nav = document.querySelector(".nav");

function setMobileMenu(open){
  if (!menu || !nav) return;
  nav.classList.toggle("open", Boolean(open));
  menu.setAttribute("aria-expanded", String(Boolean(open)));
  menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menu.textContent = open ? "×" : "☰";
}

if (menu && nav) {
  const toggleMobileMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMobileMenu(!nav.classList.contains("open"));
  };
  // A single click handler is intentional. On touch screens a normal tap
  // produces a click; registering both touchend and click toggled the menu
  // twice (open, then immediately closed), which made a long-press appear
  // necessary.
  menu.addEventListener("click", toggleMobileMenu, {passive:false});
}

document.querySelectorAll(".nav a").forEach(link => {
  link.addEventListener("click", () => setMobileMenu(false));
});

document.querySelectorAll("[data-year]").forEach(node => {
  node.textContent = new Date().getFullYear();
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach(node => observer.observe(node));

function clean(value) {
  return String(value || "").trim();
}


const SAMARA_WHATSAPP_LOGO_URL = "https://samaraassistedliving.com/assets/samara-logo.png";
function brandWhatsAppMessage(message) {
  const text = String(message || "").trim();
  if (text.includes(SAMARA_WHATSAPP_LOGO_URL)) return text;
  return `*SAMARA ASSISTED LIVING*\n${SAMARA_WHATSAPP_LOGO_URL}\n\n${text}`;
}

function whatsapp(message, statusNode) {
  localStorage.setItem("samara_public_last_request", JSON.stringify({
    message,
    created_at: new Date().toISOString()
  }));
  if (statusNode) statusNode.textContent = "Opening WhatsApp with your request…";
  window.open(`https://wa.me/${SAMARA_WHATSAPP}?text=${encodeURIComponent(brandWhatsAppMessage(message))}`, "_blank", "noopener,noreferrer");
}

function getSamaraPublicSupabase(){
  const cfg=window.SAMARA_PUBLIC_CONFIG||{};
  return window.supabase&&cfg.supabaseUrl&&cfg.supabasePublishableKey
    ? window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey)
    : null;
}

document.querySelector("#visit-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form=event.currentTarget, data=new FormData(form), status=form.querySelector(".form-status"), button=form.querySelector('button[type="submit"]');
  const client=getSamaraPublicSupabase();
  if(!client){ status.className='form-status error'; status.textContent='Secure connection is unavailable. Please try again shortly.'; return; }
  button.disabled=true; button.textContent='Sending…'; status.className='form-status'; status.textContent='Sending your visit request securely to Samara…';
  try{
    const {data:result,error}=await client.rpc('public_submit_visit_request',{
      p_visitor_name:clean(data.get('name')), p_visitor_mobile:clean(data.get('mobile')),
      p_visit_date:clean(data.get('date')), p_visit_time:clean(data.get('time')), p_message:clean(data.get('message'))
    });
    if(error) throw error;
    form.reset(); status.className='form-status success';
    status.textContent='Visit request sent successfully. Samara Admin / Manager will review and confirm it.';
  }catch(error){ console.error('Visit request failed',error); status.className='form-status error'; status.textContent=error.message||'Unable to send visit request. Please try again.'; }
  finally{ button.disabled=false; button.textContent='Send Visit Request'; }
});

document.querySelector("#enquiry-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form=event.currentTarget, data=new FormData(form), status=form.querySelector('.form-status'), button=form.querySelector('button[type="submit"]');
  const client=getSamaraPublicSupabase();
  if(!client){ status.className='form-status error'; status.textContent='Secure connection is unavailable. Please try again shortly.'; return; }
  button.disabled=true; button.textContent='Sending…'; status.className='form-status'; status.textContent='Sending your admission enquiry securely to Samara…';
  try{
    const ageRaw=clean(data.get('age'));
    const {data:result,error}=await client.rpc('public_submit_admission_enquiry',{
      p_resident_name:clean(data.get('resident')), p_age:ageRaw?Number(ageRaw):null,
      p_contact_person:clean(data.get('contact')), p_mobile:clean(data.get('mobile')),
      p_care_type:clean(data.get('care')), p_preferred_room:clean(data.get('room')), p_condition:clean(data.get('condition'))
    });
    if(error) throw error;
    form.reset(); status.className='form-status success';
    status.textContent='Admission enquiry sent successfully. It is now available to Samara Admin / Manager in ERP → Enquiries.';
  }catch(error){ console.error('Admission enquiry failed',error); status.className='form-status error'; status.textContent=error.message||'Unable to send admission enquiry. Please try again.'; }
  finally{ button.disabled=false; button.textContent='Send Admission Enquiry'; }
});

const MAX_CAREER_FILE_SIZE = 10 * 1024 * 1024;

function careerApplicationId() {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("");
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
  return `SAM-HR-${date}-${random}`;
}

function selectedLanguages(form) {
  return [...form.querySelectorAll('input[name="languages_known"]:checked')].map(input => input.value);
}

function selectedNursingDepartments(form) {
  return [...form.querySelectorAll('input[name="nursing_departments"]:checked')].map(input => input.value);
}

function careerSkillsSummary(form) {
  const data = new FormData(form);
  const languages = [...(form.dataset.languages ? JSON.parse(form.dataset.languages) : [])];
  const otherLanguage = clean(data.get("other_language"));
  if (languages.includes("Others") && otherLanguage) languages[languages.indexOf("Others")] = otherLanguage;
  const departments = selectedNursingDepartments(form);
  const otherDepartment = clean(data.get("other_nursing_department"));
  const normalizedDepartments = departments.map(value => value === "Other Nursing Department" && otherDepartment ? otherDepartment : value);
  return [
    ...languages.map(value => `Language: ${value}`),
    clean(data.get("other_skills")) ? `Other Skills: ${clean(data.get("other_skills"))}` : "",
    clean(data.get("driving")) ? `Driving: ${clean(data.get("driving"))}` : "",
    clean(data.get("driving")) === "Yes" && clean(data.get("driving_license")) ? `Valid Driving Licence: ${clean(data.get("driving_license"))}` : "",
    ...normalizedDepartments.map(value => `Nursing Department: ${value}`)
  ].filter(Boolean);
}

function validateCareerFile(input, required = false) {
  const file = input?.files?.[0];
  if (!file) {
    if (required) throw new Error(`Please select ${input?.closest(".career-upload-card")?.querySelector("strong")?.textContent || "the required document"}.`);
    return null;
  }
  if (file.size > MAX_CAREER_FILE_SIZE) throw new Error(`${file.name} exceeds the maximum permitted size of 10 MB.`);
  return file;
}

const CAREER_DESIGNATIONS = {"Nursing": ["Nurse Manager", "Nursing Supervisor", "Staff Nurse", "ANM"], "Caregiving": ["Senior Caregiver", "Caregiver", "Nursing Assistant"], "Medical": ["Duty Medical Officer – Part Time", "Visiting Doctor", "Medical Officer"], "Physiotherapy & Rehabilitation": ["Physiotherapist", "Rehabilitation Assistant"], "Housekeeping": ["Housekeeping Supervisor", "Housekeeping Staff", "Laundry Staff"], "Food & Kitchen": ["Dietician", "Cook", "Kitchen Assistant", "Food Service Assistant"], "Administration": ["Facility Administrator", "Manager", "Receptionist", "Administrative Assistant"], "HR": ["HR Manager", "HR Executive", "HR Assistant"], "Operations": ["Operations Manager", "Operations Executive", "Facility Coordinator"], "Accounts & Finance": ["Accountant", "Accounts Executive", "Accounts Assistant"], "Maintenance": ["Maintenance Supervisor", "Technician", "Electrician / Plumber"], "Security": ["Security Supervisor", "Security Guard"], "Transport": ["Driver", "Transport Coordinator"], "Marketing & Outreach": ["Marketing Executive", "Community Outreach Executive"], "Other": ["General Application", "Volunteer", "Other"]};

const CAREER_TN_DISTRICT_TALUKS={
    'Ariyalur':['Andimadam','Ariyalur','Sendurai','Udayarpalayam'],
    'Chengalpattu':['Cheyyur','Madurantakam','Pallavaram','Tambaram','Thirukalukundram','Tiruporur','Vandalur'],
    'Chennai':['Alandur','Ambattur','Aminjikarai','Ayanavaram','Egmore','Guindy','Madhavaram','Maduravoyal','Mambalam','Mylapore','Perambur','Purasawalkam','Sholinganallur','Thiruvottriyur','Tondiarpet','Velachery'],
    'Coimbatore':['Anaimalai','Annur','Coimbatore North','Coimbatore South','Kinathukadavu','Madukkarai','Mettupalayam','Perur','Pollachi','Sulur','Valparai'],
    'Cuddalore':['Bhuvanagiri','Chidambaram','Cuddalore','Kattumannarkoil','Kurinjipadi','Panruti','Srimushnam','Tittakudi','Vepur','Virudhachalam'],
    'Dharmapuri':['Dharmapuri','Harur','Karimangalam','Nallampalli','Palacode','Pappireddipatti','Pennagaram'],
    'Dindigul':['Athoor','Dindigul East','Dindigul West','Gujiliamparai','Kodaikanal','Natham','Nilakottai','Oddanchatram','Palani','Vedasandur'],
    'Erode':['Anthiyur','Bhavani','Erode','Gobichettipalayam','Kodumudi','Modakkurichi','Nambiyur','Perundurai','Sathyamangalam','Thalavadi'],
    'Kallakurichi':['Chinnasalem','Kallakurichi','Kalvarayan Hills','Sankarapuram','Tirukoilur','Ulundurpet'],
    'Kancheepuram':['Kancheepuram','Kundrathur','Sriperumbudur','Uthiramerur','Walajabad'],
    'Kanniyakumari':['Agastheeswaram','Kalkulam','Killiyur','Thiruvattar','Thovalai','Vilavancode'],
    'Karur':['Aravakurichi','Kadavur','Karur','Krishnarayapuram','Kulithalai','Manmangalam','Pugalur'],
    'Krishnagiri':['Anchetty','Bargur','Denkanikottai','Hosur','Krishnagiri','Pochampalli','Shoolagiri','Uthangarai'],
    'Madurai':['Kalligudi','Madurai East','Madurai North','Madurai South','Madurai West','Melur','Peraiyur','Thirumangalam','Thirupparankundram','Usilampatti','Vadipatti'],
    'Mayiladuthurai':['Kuthalam','Mayiladuthurai','Sirkazhi','Tharangambadi'],
    'Nagapattinam':['Kilvelur','Nagapattinam','Thirukkuvalai','Vedaranyam'],
    'Namakkal':['Kolli Hills','Kumarapalayam','Mohanur','Namakkal','Paramathi Velur','Rasipuram','Sendamangalam','Tiruchengode'],
    'The Nilgiris':['Coonoor','Gudalur','Kotagiri','Kundah','Pandalur','Udhagamandalam'],
    'Perambalur':['Alathur','Kunnam','Perambalur','Veppanthattai'],
    'Pudukkottai':['Alangudi','Aranthangi','Avudaiyarkoil','Gandarvakottai','Iluppur','Karambakudi','Kulathur','Manamelkudi','Ponnamaravathi','Pudukkottai','Thirumayam','Viralimalai'],
    'Ramanathapuram':['Kadaladi','Kamuthi','Keelakarai','Mudukulathur','Paramakudi','Rajasingamangalam','Ramanathapuram','Rameswaram','Tiruvadanai'],
    'Ranipet':['Arakkonam','Arcot','Kalavai','Nemili','Sholinghur','Walajah'],
    'Salem':['Attur','Edappadi','Gangavalli','Kadayampatti','Mettur','Omalur','Pethanaickenpalayam','Salem','Salem South','Sankari','Vazhapadi','Yercaud'],
    'Sivaganga':['Devakottai','Ilayangudi','Kalaiyarkoil','Karaikudi','Manamadurai','Singampunari','Sivaganga','Thiruppathur','Tiruppuvanam'],
    'Tenkasi':['Alangulam','Kadayanallur','Sankarankovil','Shenkottai','Sivagiri','Tenkasi','Thiruvengadam','Veerakeralampudur'],
    'Thanjavur':['Budalur','Kumbakonam','Orathanadu','Papanasam','Pattukkottai','Peravurani','Thanjavur','Thiruvaiyaru','Thiruvidaimarudur'],
    'Theni':['Andipatti','Bodinayakanur','Periyakulam','Theni','Uthamapalayam'],
    'Thoothukudi':['Eral','Ettayapuram','Kayathar','Kovilpatti','Ottapidaram','Sathankulam','Srivaikuntam','Thoothukudi','Tiruchendur','Vilathikulam'],
    'Tiruchirappalli':['Lalgudi','Manachanallur','Manapparai','Marungapuri','Musiri','Srirangam','Thottiyam','Thuraiyur','Tiruchirappalli East','Tiruchirappalli West','Tiruverumbur'],
    'Tirunelveli':['Ambasamudram','Cheranmahadevi','Manur','Nanguneri','Palayamkottai','Radhapuram','Thisayanvilai','Tirunelveli'],
    'Tirupathur':['Ambur','Natrampalli','Tirupathur','Vaniyambadi'],
    'Tiruppur':['Avinashi','Dharapuram','Kangeyam','Madathukulam','Palladam','Tiruppur North','Tiruppur South','Udumalpet','Uthukuli'],
    'Tiruvallur':['Avadi','Gummidipoondi','Pallipet','Ponneri','Poonamallee','R.K. Pet','Tiruttani','Tiruvallur','Uthukottai'],
    'Tiruvannamalai':['Arani','Chengam','Chetpet','Cheyyar','Jamunamarathur','Kalasapakkam','Kilpennathur','Polur','Thandrampet','Tiruvannamalai','Vandavasi','Vembakkam'],
    'Tiruvarur':['Kodavasal','Koothanallur','Mannargudi','Muthupet','Nannilam','Needamangalam','Thiruthuraipoondi','Tiruvarur','Valangaiman'],
    'Vellore':['Anaicut','Gudiyatham','Katpadi','K.V. Kuppam','Pernambut','Vellore'],
    'Viluppuram':['Gingee','Kandachipuram','Marakkanam','Melmalayanur','Tindivanam','Vanur','Vikravandi','Viluppuram'],
    'Virudhunagar':['Aruppukkottai','Kariapatti','Rajapalayam','Sattur','Sivakasi','Srivilliputhur','Tiruchuli','Vembakottai','Virudhunagar','Watrap']
  };

function populateCareerDesignations(department, selected="") {
  const designation = document.querySelector("#career-designation");
  if (!designation) return;
  const choices = CAREER_DESIGNATIONS[department] || [];
  designation.innerHTML = choices.length
    ? '<option value="">Select designation</option>' + choices.map(value => `<option>${value}</option>`).join("")
    : '<option value="">Select department first</option>';
  designation.disabled = !choices.length;
  if (selected && choices.includes(selected)) designation.value = selected;
}

function populateCareerTaluks(prefix) {
  const district = document.querySelector(`#career-${prefix}-district`);
  const taluk = document.querySelector(`#career-${prefix}-taluk`);
  if (!district || !taluk) return;
  const values = CAREER_TN_DISTRICT_TALUKS[district.value] || [];
  const current = taluk.value;
  taluk.innerHTML = values.length
    ? '<option value="">Select taluk</option>' + values.map(value => `<option>${value}</option>`).join("")
    : '<option value="">Select district first</option>';
  taluk.disabled = !values.length || (prefix === "permanent" && document.querySelector("#career-address-same")?.checked);
  if (values.includes(current)) taluk.value = current;
}

const CAREER_ADDRESS_KEYS = [
  "state","district","taluk","village_town","locality_area","street_name",
  "house_no","apartment_name","flat_no","landmark","pincode"
];

function composeCareerAddress(form,prefix) {
  const value = key => clean(new FormData(form).get(`${prefix}_${key}`));
  return [
    [value("flat_no"),value("apartment_name")].filter(Boolean).join(", "),
    value("house_no"),value("street_name"),value("locality_area"),value("village_town"),
    value("taluk"),value("district"),value("state"),value("pincode")
  ].filter(Boolean).join(", ");
}

function syncCareerAddress(form,prefix) {
  const output = form.elements[`${prefix}_address`];
  if (output) output.value = composeCareerAddress(form,prefix);
}

function copyCareerCurrentToPermanent(form) {
  CAREER_ADDRESS_KEYS.forEach(key => {
    const source = form.elements[`current_${key}`];
    const target = form.elements[`permanent_${key}`];
    if (source && target) target.value = source.value;
  });
  populateCareerTaluks("permanent");
  if (form.elements.permanent_taluk) form.elements.permanent_taluk.value = form.elements.current_taluk?.value || "";
  syncCareerAddress(form,"permanent");
}

function setCareerExperienceLevel(level) {
  const form = document.querySelector("#career-form");
  if (!form) return;
  const isFresher = level === "Fresher";
  const isExperienced = level === "Experienced";

  form.querySelectorAll(".career-fresher-only").forEach(label => {
    label.hidden = !isFresher;
    label.querySelectorAll("input,select,textarea").forEach(field => {
      field.disabled = !isFresher;
      field.required = isFresher && (field.name === "last_institution" || field.name === "course_details");
      if (!isFresher) field.value = "";
    });
  });

  form.querySelectorAll(".career-experienced-only").forEach(label => {
    label.hidden = !isExperienced;
    label.querySelectorAll("input,select,textarea").forEach(field => {
      field.disabled = !isExperienced;
      field.required = false;
      if (!isExperienced) {
        if (field.tagName === "SELECT") field.selectedIndex = 0;
        else field.value = "";
      }
    });
  });
}



function updateCareerReferenceDetails() {
  const form = document.querySelector("#career-form");
  if (!form) return;
  const show = form.elements.reference_type?.value === "Friends / Relatives / Seniors";
  form.querySelectorAll(".career-personal-reference-only").forEach(label => {
    label.hidden = !show;
    label.style.display = show ? "" : "none";
    label.querySelectorAll("input,select,textarea").forEach(field => {
      field.disabled = !show;
      field.required = show;
      field.setAttribute("aria-required", show ? "true" : "false");
      if (!show) field.value = "";
    });
  });
}

function updateCareerExperiencedNursing() {
  const form = document.querySelector("#career-form");
  if (!form) return;
  const show = form.elements.experience_level?.value === "Experienced" && form.elements.department?.value === "Nursing";
  form.querySelectorAll(".career-experienced-nursing-only").forEach(section => {
    section.hidden = !show;
    section.querySelectorAll("input,select,textarea").forEach(field => {
      field.disabled = !show;
      if (!show) {
        if (field.type === "checkbox") field.checked = false;
        else field.value = "";
      }
    });
  });
  updateCareerOtherNursingDepartment();
}

function updateCareerOtherNursingDepartment() {
  const form = document.querySelector("#career-form");
  if (!form) return;
  const wrap = document.querySelector("#career-other-nursing-dept-wrap");
  const field = form.elements.other_nursing_department;
  const checked = !!form.querySelector('input[name="nursing_departments"][value="Other Nursing Department"]:checked');
  if (wrap) wrap.hidden = !checked;
  if (field) {
    field.disabled = !checked;
    if (!checked) field.value = "";
  }
}

function addCareerLanguage(value) {
  const form = document.querySelector("#career-form");
  if (!form || !value) return;
  let values = [];
  try { values = JSON.parse(form.dataset.languages || "[]"); } catch (_) {}
  if (!values.includes(value)) values.push(value);
  form.dataset.languages = JSON.stringify(values);
  renderCareerLanguages();
}

function renderCareerLanguages() {
  const form = document.querySelector("#career-form");
  const holder = document.querySelector("#career-selected-languages");
  if (!form || !holder) return;
  let values = [];
  try { values = JSON.parse(form.dataset.languages || "[]"); } catch (_) {}
  const target = holder.querySelector("span");
  if (target) target.innerHTML = values.length ? values.map(value => `<button type="button" class="career-language-chip" data-remove-language="${value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;")}">${value} ×</button>`).join(" ") : "None";
  const otherWrap = document.querySelector("#career-other-language-wrap");
  const otherField = form.elements.other_language;
  const showOther = values.includes("Others");
  if (otherWrap) otherWrap.hidden = !showOther;
  if (otherField) {
    otherField.disabled = !showOther;
    if (!showOther) otherField.value = "";
  }
}

function updateCareerDriving() {
  const form = document.querySelector("#career-form");
  const wrap = document.querySelector("#career-driving-license-wrap");
  if (!form) return;
  const show = form.elements.driving?.value === "Yes";
  if (wrap) wrap.hidden = !show;
  if (form.elements.driving_license) {
    form.elements.driving_license.disabled = !show;
    if (!show) form.elements.driving_license.value = "";
  }
}

document.querySelector("#career-experience-level")?.addEventListener("change", event => { setCareerExperienceLevel(event.target.value); updateCareerExperiencedNursing(); });
document.querySelector("#career-reference-source")?.addEventListener("change", updateCareerReferenceDetails);
document.querySelector("#career-department")?.addEventListener("change", event => { populateCareerDesignations(event.target.value); updateCareerExperiencedNursing(); });
document.querySelector("#career-language-select")?.addEventListener("change", event => { addCareerLanguage(event.target.value); event.target.value = ""; });
document.querySelector("#career-selected-languages")?.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-language]");
  const form = document.querySelector("#career-form");
  if (!button || !form) return;
  let values = [];
  try { values = JSON.parse(form.dataset.languages || "[]"); } catch (_) {}
  values = values.filter(value => value !== button.dataset.removeLanguage);
  form.dataset.languages = JSON.stringify(values);
  renderCareerLanguages();
});
document.querySelector("#career-driving")?.addEventListener("change", updateCareerDriving);
document.querySelectorAll('input[name="nursing_departments"]').forEach(input => input.addEventListener("change", updateCareerOtherNursingDepartment));
document.querySelector("#career-current-district")?.addEventListener("change", () => { populateCareerTaluks("current"); syncCareerAddress(document.querySelector("#career-form"),"current"); });
document.querySelector("#career-permanent-district")?.addEventListener("change", () => { populateCareerTaluks("permanent"); syncCareerAddress(document.querySelector("#career-form"),"permanent"); });

document.querySelectorAll(".career-role-apply").forEach(button => {
  button.addEventListener("click", event => {
    // Keep the #career-application href as a no-JavaScript/mobile fallback,
    // but use an offset-aware scroll when JavaScript is available.
    event.preventDefault();

    const department = document.querySelector("#career-department");
    if (department) {
      department.value = button.dataset.careerDepartment || "";
      populateCareerDesignations(department.value, button.dataset.careerDesignation || "");
    }

    const target = document.querySelector("#career-application");
    const form = document.querySelector("#career-form");
    if (!target) return;

    // The careers page uses reveal-on-scroll. Make the application content
    // visible immediately so mobile browsers cannot land on an invisible form.
    target.querySelectorAll(".reveal").forEach(node => node.classList.add("visible"));
    form?.classList.add("visible");

    // Allow the browser one frame to finish any mobile layout changes before scrolling.
    requestAnimationFrame(() => {
      const header = document.querySelector(".header");
      const headerOffset = (header?.getBoundingClientRect().height || 72) + 12;
      const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
      try {
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } catch (_) {
        window.scrollTo(0, Math.max(0, top));
      }
      history.replaceState(null, "", "#career-application");
    });
  });
});

const CAREER_SALUTATIONS_BY_GENDER = {
  Male: ["Mr.","Dr.","Prof.","Shri","Rev.","Fr.","Br.","Other"],
  Female: ["Mrs.","Ms.","Miss","Dr.","Prof.","Smt.","Rev.","Sr.","Other"],
  Other: ["Dr.","Prof.","Mx.","Rev.","Other"]
};

function normaliseCareerPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function updateCareerSalutations(form) {
  if (!form) return;
  const gender = form.elements.gender?.value || "";
  const title = form.elements.title;
  if (!title) return;
  const previous = title.value;
  const choices = CAREER_SALUTATIONS_BY_GENDER[gender] || [];
  title.innerHTML = `<option value="">${gender ? "Select salutation" : "Select gender first"}</option>` + choices.map(value => `<option value="${value}">${value}</option>`).join("");
  title.disabled = !gender;
  if (previous && choices.includes(previous)) title.value = previous;
}

function validateCareerIdentity(form, showPopup = true) {
  const mobile = normaliseCareerPhone(form.elements.mobile?.value);
  const emergency = normaliseCareerPhone(form.elements.emergency_contact?.value);
  if (mobile.length === 10 && emergency.length === 10 && mobile === emergency) {
    const message = "Applicant mobile number and Father / Mother / Guardian mobile number must be different. Please provide a different emergency contact number.";
    form.elements.emergency_contact?.setCustomValidity(message);
    if (showPopup) window.alert(message);
    form.elements.emergency_contact?.focus();
    return false;
  }
  form.elements.emergency_contact?.setCustomValidity("");
  const gender = form.elements.gender?.value || "";
  const title = form.elements.title?.value || "";
  const allowed = CAREER_SALUTATIONS_BY_GENDER[gender] || [];
  if (gender && title && !allowed.includes(title)) {
    const message = `The selected salutation (${title}) does not match the selected gender (${gender}). Please choose the correct salutation.`;
    if (showPopup) window.alert(message);
    form.elements.title?.focus();
    return false;
  }
  return true;
}

const careerForm = document.querySelector("#career-form");
if (careerForm) {
  careerForm.dataset.languages = "[]";
  updateCareerSalutations(careerForm);
  careerForm.elements.gender?.addEventListener("change", () => updateCareerSalutations(careerForm));
  careerForm.elements.mobile?.addEventListener("input", () => careerForm.elements.emergency_contact?.setCustomValidity(""));
  careerForm.elements.emergency_contact?.addEventListener("input", () => {
    careerForm.elements.emergency_contact.setCustomValidity("");
    const mobile = normaliseCareerPhone(careerForm.elements.mobile?.value);
    const emergency = normaliseCareerPhone(careerForm.elements.emergency_contact?.value);
    if (mobile.length === 10 && emergency.length === 10 && mobile === emergency) {
      careerForm.elements.emergency_contact.setCustomValidity("Applicant and emergency / guardian mobile numbers must be different.");
    }
  });
  careerForm.elements.emergency_contact?.addEventListener("blur", () => validateCareerIdentity(careerForm, true));
  setCareerExperienceLevel(careerForm.elements.experience_level?.value || "");
  updateCareerExperiencedNursing();
  updateCareerReferenceDetails();
  renderCareerLanguages();
  updateCareerDriving();
  careerForm.querySelectorAll('[name^="current_"],[name^="permanent_"]').forEach(input => {
    if (input.name.endsWith("_address")) return;
    input.addEventListener("input", () => {
      const prefix = input.name.startsWith("current_") ? "current" : "permanent";
      syncCareerAddress(careerForm,prefix);
      if (prefix === "current" && careerForm.elements.permanent_same_as_current?.checked) copyCareerCurrentToPermanent(careerForm);
    });
    input.addEventListener("change", () => {
      const prefix = input.name.startsWith("current_") ? "current" : "permanent";
      syncCareerAddress(careerForm,prefix);
      if (prefix === "current" && careerForm.elements.permanent_same_as_current?.checked) copyCareerCurrentToPermanent(careerForm);
    });
  });

  careerForm.elements.permanent_same_as_current?.addEventListener("change", event => {
    const same = event.target.checked;
    CAREER_ADDRESS_KEYS.forEach(key => {
      const target = careerForm.elements[`permanent_${key}`];
      if (target) target.disabled = same;
    });
    if (same) copyCareerCurrentToPermanent(careerForm);
  });
}

document.querySelectorAll('.career-upload-card input[type="file"]').forEach(input => {
  input.addEventListener("change", () => {
    const display = input.closest(".career-upload-card")?.querySelector(".career-file-name");
    if (!display) return;
    const file = input.files?.[0];
    display.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "No file selected";
  });
});

const publicCfg = window.SAMARA_PUBLIC_CONFIG || {};
const publicSupabase = window.supabase && publicCfg.supabaseUrl && publicCfg.supabasePublishableKey
  ? window.supabase.createClient(publicCfg.supabaseUrl, publicCfg.supabasePublishableKey) : null;

function safeCareerFilename(file) {
  return String(file?.name || "document").replace(/[^A-Za-z0-9._-]/g, "_");
}

async function uploadCareerDocument(uploadId, kind, file) {
  if (!file) return "";
  if (!publicSupabase) throw new Error("Secure application connection is unavailable. Please try again shortly.");
  const path = `public/${uploadId}/${kind}-${safeCareerFilename(file)}`;
  const { error } = await publicSupabase.storage.from("career-applications").upload(path, file, {
    upsert: false, contentType: file.type || undefined
  });
  if (error) throw new Error(`Unable to upload ${file.name}: ${error.message}`);
  return path;
}

document.querySelector("#career-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".form-status");
  const submitButton = form.querySelector('button[type="submit"]');
  status.className = "form-status career-form-status";
  status.textContent = "";

  if (!validateCareerIdentity(form, true)) {
    status.classList.add("error");
    status.textContent = "Please correct the identity / contact details before submitting.";
    return;
  }

  const firstInvalid = form.querySelector(":invalid");
  if (firstInvalid) {
    firstInvalid.focus(); firstInvalid.reportValidity();
    status.classList.add("error");
    status.textContent = "Please complete all mandatory fields before submitting.";
    return;
  }

  try {
    submitButton.disabled = true;
    submitButton.textContent = "Submitting securely…";
    if (!publicSupabase) throw new Error("Secure application connection is unavailable. Please refresh and try again.");

    if (form.elements.permanent_same_as_current?.checked) copyCareerCurrentToPermanent(form);
    syncCareerAddress(form,"current"); syncCareerAddress(form,"permanent");

    const resume = validateCareerFile(form.elements.resume, true);
    const photo = validateCareerFile(form.elements.photo, true);
    const identity = validateCareerFile(form.elements.identity, true);
    const qualificationCert = validateCareerFile(form.elements.qualification_certificate);
    const experienceCert = form.elements.experience_level?.value === "Experienced" ? validateCareerFile(form.elements.experience_certificate) : null;
    const otherCert = validateCareerFile(form.elements.other_certificate);

    const data = new FormData(form);
    const applicationId = careerApplicationId();
    const uploadId = crypto.randomUUID();
    const skills = careerSkillsSummary(form);

    status.textContent = "Uploading your employee documents securely…";
    const [resumePath,photoPath,identityPath,qualificationPath,experiencePath,otherPath] = await Promise.all([
      uploadCareerDocument(uploadId,"resume",resume),
      uploadCareerDocument(uploadId,"employee-photo",photo),
      uploadCareerDocument(uploadId,"identity",identity),
      uploadCareerDocument(uploadId,"qualification",qualificationCert),
      uploadCareerDocument(uploadId,"experience",experienceCert),
      uploadCareerDocument(uploadId,"other-certificate",otherCert)
    ]);

    status.textContent = "Saving your online application to Samara HR…";
    const payload = {
      application_id: applicationId,
      title: clean(data.get("title")),
      gender: clean(data.get("gender")),
      applicant_name: clean(data.get("name")),
      father_guardian_name: clean(data.get("father_guardian_name")),
      date_of_birth: clean(data.get("dob")),
      blood_group: clean(data.get("blood_group")),
      mobile: clean(data.get("mobile")),
      whatsapp: clean(data.get("mobile")),
      emergency_contact: clean(data.get("emergency_contact")),
      email: clean(data.get("email")),
      id_card_type: clean(data.get("id_card_type")),
      id_card_number: clean(data.get("id_card_number")),
      department: clean(data.get("department")),
      designation: clean(data.get("designation")),
      qualification: clean(data.get("qualification")),
      previous_workplace: clean(data.get("previous_workplace")),
      current_employer: clean(data.get("previous_workplace")),
      reference_type: clean(data.get("reference_type")) || "Direct",
      reference_name: clean(data.get("reference_name")),
      reference_contact: clean(data.get("reference_contact")),
      registration_no: clean(data.get("registration")),
      experience: clean(data.get("experience_level")) === "Fresher" ? "Fresher" : clean(data.get("experience")),
      current_salary: clean(data.get("current_salary")),
      expected_salary: clean(data.get("expected_salary")),
      notice_period: clean(data.get("notice_period")),
      employment_type: "",
      preferred_shift: "",
      skills,
      additional_information: [
        `Experience Level: ${clean(data.get("experience_level"))}`,
        clean(data.get("experience_level")) === "Fresher" && clean(data.get("last_institution")) ? `Last Institution: ${clean(data.get("last_institution"))}` : "",
        clean(data.get("experience_level")) === "Fresher" && clean(data.get("course_details")) ? `Course Details: ${clean(data.get("course_details"))}` : "",
        (() => { let v=[]; try { v=JSON.parse(form.dataset.languages||"[]"); } catch(_){}; const other=clean(data.get("other_language")); return v.length ? `Languages Known: ${v.map(x=>x==="Others"&&other?other:x).join(", ")}` : ""; })(),
        clean(data.get("other_skills")) ? `Other Skills: ${clean(data.get("other_skills"))}` : "",
        clean(data.get("driving")) ? `Driving: ${clean(data.get("driving"))}` : "",
        clean(data.get("driving")) === "Yes" && clean(data.get("driving_license")) ? `Valid Driving Licence: ${clean(data.get("driving_license"))}` : "",
        selectedNursingDepartments(form).length ? `Nursing Departments Worked In: ${selectedNursingDepartments(form).map(x=>x==="Other Nursing Department"&&clean(data.get("other_nursing_department"))?clean(data.get("other_nursing_department")):x).join(", ")}` : ""
      ].filter(Boolean).join("\n"),
      current_address: clean(data.get("current_address")),
      current_state: clean(data.get("current_state")) || "Tamil Nadu",
      current_district: clean(data.get("current_district")),
      current_taluk: clean(data.get("current_taluk")),
      current_village_town: clean(data.get("current_village_town")),
      current_locality_area: clean(data.get("current_locality_area")),
      current_street_name: clean(data.get("current_street_name")),
      current_house_no: clean(data.get("current_house_no")),
      current_apartment_name: clean(data.get("current_apartment_name")),
      current_flat_no: clean(data.get("current_flat_no")),
      current_landmark: clean(data.get("current_landmark")),
      current_pincode: clean(data.get("current_pincode")),
      permanent_same_as_current: !!form.elements.permanent_same_as_current?.checked,
      permanent_address: clean(data.get("permanent_address")),
      permanent_state: clean(data.get("permanent_state")) || "Tamil Nadu",
      permanent_district: clean(data.get("permanent_district")),
      permanent_taluk: clean(data.get("permanent_taluk")),
      permanent_village_town: clean(data.get("permanent_village_town")),
      permanent_locality_area: clean(data.get("permanent_locality_area")),
      permanent_street_name: clean(data.get("permanent_street_name")),
      permanent_house_no: clean(data.get("permanent_house_no")),
      permanent_apartment_name: clean(data.get("permanent_apartment_name")),
      permanent_flat_no: clean(data.get("permanent_flat_no")),
      permanent_landmark: clean(data.get("permanent_landmark")),
      permanent_pincode: clean(data.get("permanent_pincode")),
      resume_path: resumePath,
      photo_path: photoPath,
      identity_path: identityPath,
      qualification_certificate_path: qualificationPath,
      certificate_path: qualificationPath,
      experience_certificate_path: experiencePath,
      other_certificate_path: otherPath
    };

    const { data: result, error } = await publicSupabase.rpc("submit_career_application", { payload });
    if (error) throw error;
    const saved = Array.isArray(result) ? result[0] : result;
    const code = saved?.application_code || applicationId;

    localStorage.setItem("samara_last_career_application", JSON.stringify({
      application_id: code, applicant: payload.applicant_name,
      department: payload.department, designation: payload.designation,
      mobile: payload.mobile, submitted_at: new Date().toISOString()
    }));

    status.classList.add("success");
    status.innerHTML = `Online application submitted successfully to Samara HR. <strong>Application ID: ${code}</strong>. Please keep this reference for all recruitment communication.`;
    form.reset();
    form.dataset.languages = "[]";
    setCareerExperienceLevel("");
    updateCareerExperiencedNursing();
    renderCareerLanguages();
    updateCareerDriving();
    populateCareerDesignations("");
    populateCareerTaluks("current"); populateCareerTaluks("permanent");
    document.querySelectorAll(".career-file-name").forEach(node => node.textContent = "No file selected");
  } catch (error) {
    console.error("Career application submission failed", error);
    status.classList.add("error");
    status.textContent = error.message || "Unable to submit the online application. Please try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Online Application";
  }
});

// Inauguration opening presentation disabled after launch.
// initSamaraInaugurationInvitation();
console.info(`Samara Website ${WEBSITE_VERSION}`);



// Automatic feedback sentiment classification — rating + written feedback.
function samaraClassifyFeedbackNature({rating,category,subject,message}){
  const r=Number(rating||0);
  const text=`${category||''} ${subject||''} ${message||''}`.toLowerCase();
  let score=0;
  if(r>=5) score+=4; else if(r===4) score+=3; else if(r===3) score+=0; else if(r===2) score-=3; else if(r===1) score-=4;
  const positive=[
    ['excellent',3],['very good',2],['good',1],['great',2],['wonderful',3],['fantastic',3],['superb',3],['happy',2],['satisfied',2],['thank',1],['thanks',1],['appreciate',2],['appreciation',2],['caring',2],['careful',1],['kind',2],['compassion',2],['comfortable',1],['helpful',2],['supportive',2],['professional',2],['clean',1],['prompt',1],['compliment',3],['improved',1],['well cared',3],['reassured',2]
  ];
  const negative=[
    ['bad',-2],['poor',-3],['terrible',-4],['worst',-4],['unhappy',-3],['dissatisfied',-3],['complaint',-3],['concern',-2],['problem',-2],['issue',-1],['delay',-2],['late',-1],['rude',-4],['unclean',-3],['dirty',-3],['pain',-1],['missed',-2],['not given',-3],['not done',-3],['no response',-3],['unresponsive',-3],['overcharge',-3],['wrong',-2],['disappointed',-3],['improve',-1],['improvement needed',-2],['unsafe',-4]
  ];
  positive.forEach(([term,val])=>{if(text.includes(term))score+=val});
  negative.forEach(([term,val])=>{if(text.includes(term))score+=val});
  if(String(category||'').toLowerCase().includes('compliment'))score+=3;
  if(String(category||'').toLowerCase().includes('complaint'))score-=3;
  // Strong star ratings remain decisive unless the written feedback strongly contradicts them.
  return score>=0?'Positive':'Negative';
}

// v2.3.2 — Website Feedback without WhatsApp OTP.
(() => {
  const form=document.querySelector('#feedback-form');
  if(!form)return;

  const replyRequested=form.querySelector('#feedback-reply-requested');
  const mobileInput=form.querySelector('#feedback-mobile');
  const status=form.querySelector('.form-status');
  const submitButton=form.querySelector('button[type="submit"]');

  const invokeFeedback=async body=>{
    if(!publicSupabase)throw new Error('Secure feedback connection is unavailable.');
    const {data,error}=await publicSupabase.functions.invoke('feedback-public',{body});
    if(error){
      const message=error?.context?.body?.error||error?.message||'Feedback service returned an error.';
      throw new Error(message);
    }
    if(data?.error)throw new Error(data.error);
    return data;
  };

  replyRequested?.addEventListener('change',()=>{
    if(replyRequested.checked)mobileInput?.focus();
  });

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const fd=new FormData(form);
    try{
      const wantsReply=!!fd.get('reply_requested');
      const mobile=clean(fd.get('mobile'));
      if(wantsReply && !mobile)throw new Error('Please enter your mobile number if you would like a WhatsApp reply.');

      submitButton.disabled=true;submitButton.textContent='Submitting…';
      status.className='form-status';status.textContent='Saving your feedback securely…';
      const rating=fd.get('rating');

      const result=await invokeFeedback({
        action:'submit_feedback',
        respondent_name:clean(fd.get('name')),
        respondent_type:clean(fd.get('respondent_type'))||'Public',
        feedback_nature:samaraClassifyFeedbackNature({rating:rating?Number(rating):null,category:clean(fd.get('category')),subject:clean(fd.get('subject')),message:clean(fd.get('message'))}),
        mobile,
        email:clean(fd.get('email')),
        patient_code:clean(fd.get('patient_code')),
        category:clean(fd.get('category'))||'General',
        rating:rating?Number(rating):null,
        subject:clean(fd.get('subject')),
        message:clean(fd.get('message')),
        reply_requested:wantsReply
      });

      form.reset();
      status.className='form-status success';
      status.innerHTML=`Thank you. Your feedback has been submitted successfully. <strong>Reference: ${result.feedback_reference}</strong>${wantsReply?' Samara will respond manually through the mobile/WhatsApp number provided.':''}`;
    }catch(error){
      console.error('Website feedback submission failed',error);
      status.className='form-status error';
      status.textContent=error.message||'Feedback could not be submitted. Please try again.';
    }finally{
      submitButton.disabled=false;submitButton.textContent='Submit Feedback';
    }
  });
})();

/* Samara Find Us + directly visible location QR — beside WhatsApp on every page */
(function(){
  function addLocationQr(){
    if(document.querySelector('.location-qr-float')) return;
    // The homepage uses class="floating" for WhatsApp, while inner pages
    // use class="floating whatsapp-float". Support both structures.
    const whatsapp=document.querySelector('.whatsapp-float, a.floating[href*="wa.me"], a[href*="wa.me"]');
    if(!whatsapp) return;
    whatsapp.classList.add('whatsapp-float');

    const link=document.createElement('a');
    link.className='floating location-qr-float';
    link.href='https://maps.app.goo.gl/NwdW9T6WFnosJg8V7?g_st=iw';
    link.target='_blank';
    link.rel='noopener';
    link.title='Samara Assisted Living – Find Us';
    link.setAttribute('aria-label','Find Us – scan the visible QR code or open Samara Assisted Living in Google Maps');

    // Force the Find Us panel dimensions so older .floating CSS cannot collapse it into a blank circle.
    const force=(el,prop,val)=>el.style.setProperty(prop,val,'important');
    force(link,'right','96px');
    force(link,'bottom','22px');
    force(link,'width','auto');
    force(link,'min-width','178px');
    force(link,'height','72px');
    force(link,'padding','6px 8px 6px 18px');
    force(link,'display','flex');
    force(link,'align-items','center');
    force(link,'justify-content','center');
    force(link,'gap','10px');
    force(link,'border-radius','38px');
    force(link,'background','#ffffff');
    force(link,'border','3px solid #ffffff');
    force(link,'color','#6b0d3c');
    force(link,'box-shadow','0 12px 30px rgba(0,0,0,.18)');
    force(link,'text-decoration','none');
    force(link,'overflow','visible');

    const label=document.createElement('span');
    label.className='location-qr-label';
    label.textContent='Find Us';
    force(label,'display','block');
    force(label,'white-space','nowrap');
    force(label,'font-size','16px');
    force(label,'line-height','1');
    force(label,'font-weight','800');
    force(label,'color','#6b0d3c');

    const img=document.createElement('img');
    img.src='data:image/jpeg;base64,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WVIllTlRWJMANVyrVQAABLVMsSeq5VWFSlhUpYVKWCT63JNVlqnmmeKwSasFTLVMsSeq5VWCTrBUywSeqywSfW5JqoGVarLCp5vSMqrJPrF+lqklpPQ+QSYAANVAyrVZYk1YKmWqZYk9VyrVQAABLVIypqoypqoypqoypqoypqoAAAS1SMqaqJapDKqypDKtVGVNVAAAGVNVGVaqAGVNVGVNVGVNVAAACWqRlWqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//xAAC/9oADAMBAAIAAwAAACEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwwwwwAAQAAQAQwAwAAAAgAQwwwwgAABQAAAAgQCAACgAAhQCgQAhACgAAAQAAABQBjCChQDgACiQCiBABRDjCCgTDBQAAABQCgAChAgxgSBgSAAgBgABgChQABQAAABQCAACgQCgAAAQABQAAAAgAChAABQAAABRDDDCBQCjQBjTChRCgTDjQCjDDDAAAAAAQwAAQAQAwQwQyAASwwgAAwAgQwgAAAAQAAQCgAChQABAAgACAQABQChAABQAAABQABCDAACiAADDDgBDDSDiBAATDDAAAABAgwACxQyhQwhgSBQShAwwASAwigwgAAAQCgQAgQAgQCgAAhAAgAAgAAAQCgAAAABQDDBDhDCDBDjQCiRDgBCCRDDTDgSAAABQABwywgQxwiwwABwQwQygwSxwCgAAAABQABQCBQABQAhQAAAABAABACAACAAAAAADDCBDBQACADDTCgBDAABgBDDQABSAAAAACRQywgAAACxwyhQSwAgwAwwwyhwAAAAQAgACBAAgAABAAhQCBAChQAgAAgAAAABRAAABgBCATDASDADCgBDhCBDDCASAAAAAigAQwgQhQQBwyhwAxQQBwihwygAAAABQCAQAhQCBACBQAAACBACBQChQAgQAAAACDhDDgCDgAABRCgADgSADSChRDjSAAAAAywwgQAAxgQAAQwAABQgBwixQyhAgAABACAACAACgQCgQAgAAAQAhAAAQAAAAAAATDDDDABDhRCCBDhSBjTADQBhRDBSAAABQAQwigACQAgBgChQyxQChwQxwChwgAABQCgACgAABAAAQCgACBQCAAAAACBAAAABQCgACgSADDDBRDgABhQAASDjDDAAAAABQQwwyhAwxQSxwygASBQiQAAAAQxQAAABAAAAAAAABACBAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/xAAC/9oADAMBAAIAAwAAABDzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzjzzzzzzzTzzTzzzjzTzzzjzTzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzxzzzzzxzzzyzzyzxzzzzzzyzzzzzzzzzzzzzzjzTjzTjzTjzzjzzjzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzxzzzyzxzzxzzxyzzyzzzzzyzzzzzzzzzzTzzTjzzjzTzzzzzzjzTjzzjzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyzxzzzyzzzzzzzzzzxyzxyzzyzzzzzjzTzzTjzTjzTjzTzzTjzzzzTzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzxyzzyzxyzzyzzyzzzzxyzzzzzyzzzzzzzzzzzjzzzzTjzzjzzjzTjzzjzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyzzyzzzzzyzxzzxzzzzzxzzzyzzyzzzzzzzTjzzjzzzzTzzTzzzjzTjzzzzTjzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzxzzxzzxyzzyzxyzxzzzyzxzzxyzzzzzjzzzzzjzTzzTzzTjzTzzTzzzzzTzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyzxyzzyzxzzzzzxzzxyzzzzzzzzzzzzzzjzzzzTzzTjzTzzzzzzjzzzzTjzTjzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyzzzzzzzzzzxyzzyzxzzxyzxzzzyzzzzzzzTzzzzzTjzzjzzjzzzzzjzzjzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzyzzzzzzzzzzxzzzyzxzzzzzzzzzzzzzzTjzzzzzzzTzzTjzTzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/xAAU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XCVY33XCV531wled3CV5693d1wlWPg/u7u7u7u7u7u64SrG+uEqx164SvO+uErzvuuEqxu4SvO+64SvO+uErzvrhK89e64SrG7hKsePu7uuErz8T93d3d3d3d3d3d3d3dcJXnfdcJVjr04dcJXnfdcJVjfXCVY69OHdcJXnr3XCVY8fTh3XCVY31wlWPT3d04d04dcJXn4n7u7u7u7u7u7u7u7unDunDuuEqx4+7unDrhK877rhK89euEqx17uuEqxvuuEqxvrhK89enDuuEqx8N93d3d3d3d3d1wlWOvd3dcJXn093d1wled3CV56904d1wlefT3dcJXnx93d1wleetwlWPhXu7u7u7u7u7uuEqxvrhK89e6cO64SrHjuErz17pw7rhKsePunDrhK8764SrG+uErz4+7u7u64SrG+uEqx8K93d3d3d3d3d3dcJXnrcJXnr3XCVY3cJXnr3d1wled9cJXnfXCVY33XCV58fTh1wled9cJVjr3d3XCVY3cJXn4P7u7u7u7u7u7uuErz6e7u7rhKsb64SvPXuuEqx16cO64SrG+uEqxu4SrHXu64SrHp6cO7pw7rhKsfCvd3d3d3d3d3d3d3dcJVjfXCVY31wleevdOHXCVY31wlWPT3dcJXnrcJVjfXCV5+M+6cO7unDunDu7u7u7u7u7u7u64SvPj7pw7u64SvPXrhKsb7rhK8764SrHv7uuErz4+6cOuErzvrhK877rhKsbuEqx8H93d3d3d3d3XCV5/L7u7u7u7pw7uuEqxvrhK89enDrhKsb64SvPXunDuuErzvrhK87uErz4+7u64SrHwr3d3d3d3d3d3d3d3d3XCV59Pd3dcJVjfXCV5691wleevXCV59PdOHd3XCVY693dcJVj4z7pw7u7u7u7u7u7u7rhK8/l93d3d3Th1wlefH3XCV531wlWPjPu7u7u7u7u7u7u7u7u7u7u7u64SrG7hKse/u7u6cO6cO64SrHXrhK87uErzvrhKsfyh7u7u7u7/9k=';
    img.alt='Samara Assisted Living location QR code';
    force(img,'display','block');
    force(img,'width','58px');
    force(img,'height','58px');
    force(img,'min-width','58px');
    force(img,'max-width','58px');
    force(img,'object-fit','contain');
    force(img,'padding','2px');
    force(img,'background','#ffffff');
    force(img,'border-radius','8px');

    const applyMobileSizing=()=>{
      if(window.matchMedia('(max-width: 640px)').matches){
        force(link,'right','88px'); force(link,'height','64px'); force(link,'min-width','156px');
        force(link,'padding','4px 6px 4px 14px'); force(link,'gap','7px'); force(link,'border-radius','34px');
        force(label,'font-size','14px');
        force(img,'width','52px'); force(img,'height','52px'); force(img,'min-width','52px'); force(img,'max-width','52px');
      }
    };
    applyMobileSizing();

    link.appendChild(label);
    link.appendChild(img);
    whatsapp.insertAdjacentElement('beforebegin',link);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',addLocationQr);
  else addLocationQr();
})();

/* Samara WhatsApp floating button — official WhatsApp logo only */
(function(){
  function applyWhatsAppLogo(){
    const links=document.querySelectorAll('a.floating[href*="wa.me"], a[href*="wa.me"].floating, .whatsapp-float[href*="wa.me"]');
    links.forEach((link)=>{
      link.classList.add('whatsapp-float');
      link.setAttribute('aria-label','WhatsApp Samara');
      link.setAttribute('title','WhatsApp Samara');
      link.innerHTML=`
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
          <path fill="#fff" d="M16.03 3.2c-6.94 0-12.58 5.54-12.58 12.37 0 2.18.58 4.31 1.68 6.18L3.35 28.3l6.79-1.74a12.72 12.72 0 0 0 5.88 1.44h.01c6.94 0 12.58-5.54 12.58-12.37S22.97 3.2 16.03 3.2Zm0 22.72h-.01a10.6 10.6 0 0 1-5.39-1.46l-.39-.23-4.03 1.03 1.08-3.86-.25-.4a10.14 10.14 0 0 1-1.63-5.53c0-5.61 4.76-10.18 10.62-10.18 5.85 0 10.61 4.57 10.61 10.18 0 5.61-4.76 10.18-10.61 10.18Zm5.82-7.61c-.32-.15-1.88-.9-2.17-1-.29-.1-.5-.15-.71.15-.21.3-.82 1-.99 1.2-.18.2-.36.22-.67.07-.32-.15-1.34-.48-2.55-1.52-.94-.81-1.58-1.82-1.76-2.12-.18-.3-.02-.46.13-.61.14-.14.32-.36.48-.54.16-.18.21-.3.32-.51.11-.2.05-.38-.03-.54-.08-.15-.71-1.66-.97-2.27-.26-.61-.52-.52-.71-.53h-.61c-.21 0-.55.08-.84.38-.29.3-1.1 1.04-1.1 2.53 0 1.49 1.13 2.93 1.29 3.13.16.2 2.22 3.27 5.38 4.59.75.31 1.34.49 1.8.63.76.23 1.45.2 1.99.12.61-.09 1.88-.74 2.14-1.46.26-.72.26-1.33.18-1.46-.08-.13-.29-.2-.61-.36Z"/>
        </svg>`;
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',applyWhatsAppLogo);
  else applyWhatsAppLogo();
})();

/* Samara developer credit — cross-browser fallback injection */
(function(){
  function ensureDeveloperCredit(){
    var footer=document.querySelector('footer');
    if(!footer) return;
    var existing=footer.querySelector('.developer-credit');
    if(existing){
      existing.style.display='block';
      existing.style.textAlign='center';
      existing.style.padding='10px 16px 16px';
      existing.style.fontSize='14px';
      existing.style.lineHeight='1.5';
      existing.style.color='rgba(255,255,255,.96)';
      return;
    }
    var credit=document.createElement('div');
    credit.className='container developer-credit';
    credit.style.display='block';
    credit.style.textAlign='center';
    credit.style.padding='10px 16px 16px';
    credit.style.fontSize='14px';
    credit.style.lineHeight='1.5';
    credit.style.color='rgba(255,255,255,.96)';
    credit.innerHTML='Developed and Maintained by: <a href="https://appgeo.in" target="_blank" rel="noopener" style="color:inherit;font-weight:700;text-decoration:none">AppGeo Private Limited (appgeo.in)</a>. Mobile: <a href="tel:+919176735577" style="color:inherit;font-weight:700;text-decoration:none">9176735577</a>';
    footer.appendChild(credit);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ensureDeveloperCredit);
  else ensureDeveloperCredit();
  window.addEventListener('load',ensureDeveloperCredit);
  setTimeout(ensureDeveloperCredit,800);
})();
