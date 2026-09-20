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
    active = null; clearTimeout(session.timer); clearTimeout(session.restartTimer); clearTimeout(session.stopTimer);
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
  // Replace only this session's insertion range. A recognition revision must
  // never be appended to the preceding version of the same spoken phrase.
  function render(session) {
    const el = session.target;
    if (!usable(el)) { finish(session,'The field closed or became unavailable. Dictation stopped.'); return false; }
    if (el.value !== session.expected) { finish(session,'The field was edited. Dictation stopped to preserve your changes.'); return false; }
    const text = [session.completed,session.phrase].filter(Boolean).join(' ');
    if (!text) return true;
    const addition = (session.prefix && !/\s$/.test(session.prefix) ? ' ' : '') + text +
      (session.suffix && !/^\s/.test(session.suffix) ? ' ' : '');
    const value = session.prefix + addition + session.suffix;
    if (value === session.expected) return true;
    session.expected = value;
    session.writing = true;
    try {
      const setter = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set;
      setter.call(el,value);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.setSelectionRange(session.prefix.length + addition.length,session.prefix.length + addition.length);
    } finally { session.writing = false; }
    return true;
  }
  function start(entry) {
    if (active?.entry === entry) {
      const session = active;
      if (session.stopping) return;
      session.stopping = true;
      clearTimeout(session.restartTimer);
      entry.status.textContent = 'Finishing dictation…';
      if (!session.rec) { finish(session,'Dictation stopped. Review the text before saving.'); return; }
      session.stopTimer = setTimeout(()=>finish(session,'Dictation stopped. Review the text before saving.'),2000);
      try { session.rec.stop(); } catch (_) { finish(session,'Dictation stopped. Review the text before saving.'); }
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
    const value = target.value || '', from = target.selectionStart ?? value.length, to = target.selectionEnd ?? value.length;
    const session = {entry,target,API,lang:entry.language.value,rec:null,expected:value,
      prefix:value.slice(0,from),suffix:value.slice(to),completed:'',phrase:'',
      stopping:false,writing:false,emptyCycles:0,timer:null,restartTimer:null,stopTimer:null};
    active = session;
    entry.button.textContent = '■ Stop Dictation'; entry.button.setAttribute('aria-pressed','true');
    entry.language.disabled = true; if (entry.fields) entry.fields.disabled = true;
    session.timer = setTimeout(()=>finish(session,'Dictation stopped after 5 minutes. Review the text, then tap Dictate to continue.'),300000);
    listen(session);
  }
  function listen(session) {
    if (active !== session || session.stopping) return;
    if (document.hidden || !usable(session.target)) { finish(session,'Dictation stopped because the field is no longer active.'); return; }
    if (session.target.value !== session.expected) { finish(session,'The field was edited. Dictation stopped to preserve your changes.'); return; }
    const {entry} = session;
    try {
      const rec = new session.API(); session.rec = rec; session.phrase = '';
      // Keep the UI session open across native utterance boundaries. Android's
      // continuous mode can report expanding phrases as separate final results.
      // A single-utterance recognizer gives one replaceable phrase per cycle.
      rec.lang = session.lang; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
      entry.status.textContent = 'Starting microphone… Tap Stop Dictation when finished.';
      const current = () => active === session && session.rec === rec;
      rec.onstart = () => { if (current()) entry.status.textContent = 'Listening… Words appear in the field as you speak. Pauses are OK. Tap Stop Dictation when finished.'; };
      rec.onresult = event => {
        if (!current()) return;
        // Rebuild from the latest single-utterance snapshot, including interim
        // corrections. Replayed or expanding results replace this phrase only.
        const result = event.results[event.results.length-1];
        const text = String(result?.[0]?.transcript || '').trim();
        if (!text) return;
        session.phrase = text;
        if (render(session)) entry.status.textContent = 'Listening… Tap Stop Dictation when finished. Review the text before saving.';
      };
      rec.onerror = event => {
        if (!current()) return;
        if (event.error === 'no-speech' && !session.stopping) return; // onend reconnects, with a quiet-session limit.
        const messages = {'not-allowed':'Microphone permission was denied. Allow microphone access in browser settings or use typing.',
          'service-not-allowed':'Browser speech recognition is blocked. Use Voice or type.',
          'network':'Speech recognition could not connect. Check your connection or use Voice.',
          'audio-capture':'No microphone is available. Check the microphone and try again.',
          'language-not-supported':'This browser does not support the selected language. Use Voice or type.'};
        finish(session,messages[event.error] || 'Dictation stopped. Review the text and try again.');
      };
      rec.onend = () => {
        if (!current()) return;
        session.rec = null;
        if (session.phrase) {
          session.completed = [session.completed,session.phrase].filter(Boolean).join(' ');
          session.phrase = ''; session.emptyCycles = 0;
        } else session.emptyCycles++;
        if (session.stopping) { finish(session,'Dictation stopped. Review the text before saving.',false); return; }
        if (session.emptyCycles >= 3) { finish(session,'No speech was heard. Dictation stopped; tap Dictate when ready.',false); return; }
        entry.status.textContent = 'Still listening… Reconnecting after the pause. Tap Stop Dictation when finished.';
        session.restartTimer = setTimeout(()=>listen(session),150);
      };
      rec.start();
    } catch (_) { finish(session,'Unable to continue dictation. Review the text, then try again or use Voice.'); }
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
    if (button.closest('.director-office-modal')) return false;
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
  // Typing, keyboard dictation or moving the caret takes ownership of the
  // field; later recognition callbacks must not overwrite those edits.
  document.addEventListener('input',event=>{if(active&&event.target===active.target&&!active.writing)cancel('Dictation stopped because you edited the field.');},true);
  document.addEventListener('pointerdown',event=>{if(active&&event.target===active.target)cancel('Dictation stopped so you can edit the field.');},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()});
  window.addEventListener('pagehide',()=>cancel());
  window.SamaraDictation={attach,stop:cancel};
  schedule();
})();
