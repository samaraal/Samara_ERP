/* Quick browser dictation. Does not submit forms or call ERP AI services. */
(() => {
  'use strict';
  const entries = new Map();
  let active = null, sequence = 0, scheduled = false;
  let language = 'ta-IN';
  try { language = localStorage.getItem('samara-dictation-language') || language; } catch (_) {}
  if (!['ta-IN','en-IN'].includes(language)) language = 'ta-IN';
  const usable = el => el && el.isConnected && !el.disabled && !el.readOnly && !el.closest('[inert]') &&
    el.dataset.samaraVoice !== 'off' && (el.tagName === 'TEXTAREA' ||
    (el.tagName === 'INPUT' && ['text','search'].includes(el.type))) && el.getClientRects().length > 0;
  function label(el) {
    return (el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.placeholder || el.name || 'Text field').trim().slice(0,100);
  }
  function finish(session, message, abort = true) {
    if (active !== session) return;
    active = null; clearTimeout(session.timer);
    session.entry.button.textContent = '🎙 Dictate';
    session.entry.button.setAttribute('aria-pressed','false');
    session.entry.language.disabled = false;
    if (session.entry.fields) session.entry.fields.disabled = false;
    session.entry.status.textContent = message;
    if (abort) { try { session.rec.abort(); } catch (_) {} }
  }
  function cancel(message = 'Dictation stopped. Review the text before saving.') {
    if (active) finish(active,message);
  }
  function insert(el, text) {
    const value = el.value || '';
    const start = el.selectionStart ?? value.length, end = el.selectionEnd ?? value.length;
    const prefix = value.slice(0,start), suffix = value.slice(end);
    const addition = (prefix && !/\s$/.test(prefix) ? ' ' : '') + text + (suffix && !/^\s/.test(suffix) ? ' ' : '');
    const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set;
    setter.call(el,prefix + addition + suffix);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.setSelectionRange(start + addition.length,start + addition.length);
  }
  function start(entry) {
    if (active?.entry === entry) {
      active.entry.status.textContent = 'Finishing dictation…';
      try { active.rec.stop(); } catch (_) { cancel(); }
      return;
    }
    cancel();
    const target = entry.target || entry.candidates?.[Number(entry.fields?.value)];
    if (!usable(target)) { entry.status.textContent = 'Choose an editable text field before dictating.'; return; }
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) { entry.status.textContent = 'Quick dictation is unavailable in this browser. Use Voice, your keyboard microphone, or type.'; return; }
    const scope = target.closest('form,.modal,.wide-modal') || document.querySelector('.content');
    if (Array.from(scope?.querySelectorAll('button') || []).some(b=>/^(■\s*)?Stop( Recording)?$/i.test(b.textContent.trim()))) {
      entry.status.textContent = 'Stop the other voice recording first.'; return;
    }
    try {
      const rec = new API();
      const session = {entry,target,rec,seen:new Set(),timer:null};
      active = session;
      rec.lang = entry.language.value; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      entry.button.textContent = '■ Stop Dictation'; entry.button.setAttribute('aria-pressed','true');
      entry.language.disabled = true; if (entry.fields) entry.fields.disabled = true;
      entry.status.textContent = 'Starting microphone…';
      rec.onstart = () => { if (active === session) entry.status.textContent = 'Listening… Speak, then tap Stop Dictation. Review before saving.'; };
      rec.onresult = event => {
        if (active !== session) return;
        if (!usable(target)) { cancel('The field closed or became unavailable. Dictation stopped.'); return; }
        let interim = '';
        for (let i=0;i<event.results.length;i++) {
          const result = event.results[i], text = String(result[0]?.transcript || '').trim();
          if (result.isFinal && !session.seen.has(i)) { session.seen.add(i); if (text) insert(target,text); }
          else if (!result.isFinal) interim += ' ' + text;
        }
        entry.status.textContent = interim.trim() || 'Text added. Continue speaking or tap Stop Dictation. Review before saving.';
      };
      rec.onerror = event => {
        const messages = {'not-allowed':'Microphone permission was denied. Allow microphone access in browser settings or use typing.',
          'service-not-allowed':'Browser speech recognition is blocked. Use Voice or type.',
          'no-speech':'No speech was heard. Tap Dictate to try again.',
          'network':'Speech recognition could not connect. Check your connection or use Voice.',
          'audio-capture':'No microphone is available. Check the microphone and try again.',
          'language-not-supported':'This browser does not support the selected language. Use Voice or type.'};
        finish(session,messages[event.error] || 'Dictation stopped. Review the text and try again.');
      };
      rec.onend = () => finish(session,'Dictation finished. Review the text before saving.',false);
      session.timer = setTimeout(()=>finish(session,'Dictation stopped after 90 seconds. Tap Dictate to continue.'),90000);
      rec.start();
    } catch (_) { if (active) cancel('Unable to start dictation. Try again or use Voice.'); }
  }
  function attach(voice, target = null) {
    const existing = entries.get(voice);
    if (existing?.root.isConnected) return;
    const root = document.createElement('span'); root.className = 'samara-dictation-tools';
    const id = 'samara-dictation-' + (++sequence);
    const languageLabel = document.createElement('label'); languageLabel.textContent = 'Language ';
    const lang = document.createElement('select'); lang.setAttribute('aria-label','Dictation language');
    for (const [value,text] of [['ta-IN','Tamil'],['en-IN','English']]) { const option=document.createElement('option'); option.value=value; option.textContent=text; lang.append(option); }
    lang.value=language; languageLabel.append(lang);
    lang.onchange=()=>{language=lang.value;try{localStorage.setItem('samara-dictation-language',language)}catch(_){} };
    const button=document.createElement('button'); button.type='button'; button.className='btn btn-secondary'; button.textContent='🎙 Dictate';
    button.setAttribute('aria-pressed','false'); button.setAttribute('aria-describedby',id);
    const status=document.createElement('span');status.id=id;status.className='samara-dictation-status';status.setAttribute('role','status');
    const entry={root,button,status,language:lang,target,voice};
    if (!target) {
      const select=document.createElement('select');select.setAttribute('aria-label','Dictation target field');
      const populate=()=>{
        const scope=voice.closest('form,.modal,.wide-modal') || document.querySelector('.content');
        entry.candidates=Array.from(scope?.querySelectorAll('textarea,input') || []).filter(el=>usable(el)&&el.type!=='search');
        const choose=document.createElement('option');choose.value='';choose.textContent='Choose text field…';select.replaceChildren(choose);
        entry.candidates.forEach((el,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=label(el);select.append(option)});
        const index=entry.candidates.indexOf(entry.target);select.value=index<0?'':String(index);if(index<0)entry.target=null;
      };
      populate();select.onfocus=populate;
      select.onchange=()=>{entry.target=select.value===''?null:entry.candidates[Number(select.value)]};
      entry.fields=select;root.append(select);
    }
    button.onclick=e=>{e.preventDefault();e.stopPropagation();if(entry.fields&&!entry.target){status.textContent='Choose a text field first.';return}start(entry)};
    root.append(languageLabel,button,status);voice.insertAdjacentElement('afterend',root);entries.set(voice,entry);
  }
  function isVoice(button) {
    if (button.closest('.samara-dictation-tools,.samara-voice-modal')) return false;
    return button.classList.contains('samara-global-voice-btn') || /^(Voice(?: Input| Entry| Assistant)?|Speak Tamil|Speak English)$/i.test(button.textContent.replace(/^[^A-Za-z]+/,'').trim());
  }
  function scan() {
    scheduled=false;
    for (const [voice,entry] of entries) {
      if (!voice.isConnected || !entry.root.isConnected) { if(active?.entry===entry)cancel();entry.root.remove();entries.delete(voice);continue; }
      const disabled=voice.disabled || (entry.target && !usable(entry.target));
      if(entry.button.disabled!==Boolean(disabled))entry.button.disabled=Boolean(disabled);
      if(disabled&&active?.entry===entry)cancel('The field is unavailable. Dictation stopped.');
    }
    if (!document.querySelector('.global-page-tools')) return;
    document.querySelectorAll('button').forEach(button=>{
      if (!isVoice(button) || entries.has(button)) return;
      if (button.classList.contains('samara-global-voice-btn')) {
        const field=button.previousElementSibling;if(usable(field))attach(button,field);
      } else {
        // A Tamil/English pair shares one quick-dictation control.
        if(Array.from(entries.keys()).some(b=>b.parentElement===button.parentElement&&!b.classList.contains('samara-global-voice-btn')))return;
        attach(button);
      }
    });
  }
  const schedule=()=>{if(!scheduled){scheduled=true;setTimeout(scan,60)}};
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','readonly']});
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('button');
    if(active && !active.entry.root.contains(event.target) && event.target!==active.target)cancel();
    if(button&&isVoice(button))cancel();
  },true);
  document.addEventListener('change',event=>{if(active&&event.target!==active.target&&!active.entry.root.contains(event.target))cancel();},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()});
  window.addEventListener('pagehide',()=>cancel());
  window.SamaraDictation={attach,stop:cancel};
  schedule();
})();
