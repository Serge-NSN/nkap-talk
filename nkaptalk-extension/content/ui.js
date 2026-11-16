/*
 * NkapTalk — floating button and conversation panel.
 * Lives in its own Shadow DOM so it never changes the page's look or code.
 * Keyboard: Alt+Shift+P open/close · Alt+Shift+M talk · Alt+Shift+T Pidgin/original · Esc stop talking
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .fab { position: fixed; right: 20px; bottom: 20px; width: 64px; height: 64px; border-radius: 50%;
    background: #0B7A3B; color: #fff; border: 3px solid #FFD100; cursor: pointer; z-index: 2147483646;
    box-shadow: 0 6px 20px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; flex-direction: column;
    font-weight: 800; font-size: 12px; letter-spacing: .3px; }
  .fab svg { width: 26px; height: 26px; }
  .fab span { font-size: 10.5px; }
  .fab:focus-visible, button:focus-visible, input:focus-visible { outline: 3px solid #FFD100; outline-offset: 2px; }
  .fab[aria-pressed="true"] { background: #075128; }
  .panel { position: fixed; right: 20px; bottom: 96px; width: 360px; max-width: calc(100vw - 40px);
    height: min(560px, calc(100vh - 120px)); background: #ffffff; color: #111; border-radius: 18px;
    box-shadow: 0 12px 40px rgba(0,0,0,.4); z-index: 2147483646; display: none; flex-direction: column; overflow: hidden;
    border: 1px solid #d0d5dd; }
  .panel.open { display: flex; }
  header { background: #0B7A3B; color: #fff; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
  header .t { flex: 1; }
  header h2 { margin: 0; font-size: 17px; font-weight: 800; }
  header .mode { font-size: 12px; opacity: .9; }
  header button { background: rgba(255,255,255,.15); color: #fff; border: 1px solid rgba(255,255,255,.4); border-radius: 999px;
    padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .lock { background: #FFF8D6; color: #4A3B00; font-size: 12.5px; padding: 7px 12px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f0e3a0; }
  .lock .s { flex: 1; }
  .lock button { background: none; border: 1px solid #b59a1e; color: #4A3B00; border-radius: 6px; font-size: 12px; padding: 3px 8px; cursor: pointer; }
  .lock.bad { background: #FDE2E1; color: #7A0B0B; }
  .log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: #F6F7F9; }
  .msg { max-width: 88%; padding: 9px 12px; border-radius: 14px; font-size: 15px; line-height: 1.4; white-space: pre-wrap; }
  .msg.nkaptalk { background: #fff; border: 1px solid #dfe3e8; align-self: flex-start; border-bottom-left-radius: 4px; }
  .msg.user { background: #0B7A3B; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px 0; background: #fff; }
  .chips button { background: #EEF6F1; color: #0B5A2C; border: 1px solid #b9dcc6; border-radius: 999px; padding: 6px 10px; font-size: 13px; cursor: pointer; }
  .bar { display: flex; gap: 8px; padding: 10px 12px 12px; background: #fff; align-items: center; }
  .mic { width: 52px; height: 52px; flex: none; border-radius: 50%; border: none; background: #0B7A3B; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .mic svg { width: 24px; height: 24px; }
  .mic.rec { background: #C62828; box-shadow: 0 0 0 calc(var(--lvl, 0) * 40px) rgba(198,40,40,.25); }
  .bar input { flex: 1; min-width: 0; border: 1px solid #c4cad3; border-radius: 12px; padding: 12px; font-size: 15px; color: #111; background: #fff; }
  .send { border: none; background: #111; color: #fff; border-radius: 12px; padding: 12px 14px; font-weight: 700; cursor: pointer; }
  .status { font-size: 12px; color: #444; padding: 0 12px 8px; background: #fff; min-height: 18px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `;

  const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const BUBBLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01" stroke-linecap="round" stroke-width="3"/></svg>';

  let root, fab, panel, log, input, mic, status, lock, modeEl, trBtn;
  let open = false;
  let recording = false;

  function el(tag, attrs = {}, html = '') {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (html) e.innerHTML = html;
    return e;
  }

  function mount() {
    if (document.getElementById('nkaptalk-root')) return;
    const host = el('div', { id: 'nkaptalk-root', translate: 'no' });
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = CSS;
    root.appendChild(style);

    fab = el('button', { class: 'fab', 'aria-label': 'NkapTalk, Pidgin assistant. Open or close (Alt+Shift+P)', 'aria-pressed': 'false', title: 'NkapTalk (Alt+Shift+P)' }, `${BUBBLE}<span>NkapTalk</span>`);
    fab.addEventListener('click', toggle);

    panel = el('section', { class: 'panel', role: 'dialog', 'aria-label': 'NkapTalk, Pidgin assistant' });
    panel.innerHTML = `
      <header>
        <div class="t"><h2>NkapTalk</h2><div class="mode"></div></div>
        <button class="tr" aria-pressed="true" title="Alt+Shift+T">Page: Pidgin</button>
        <button class="x" aria-label="Close NkapTalk">✕</button>
      </header>
      <div class="lock" role="status"><span class="s">🔒 Checking values…</span><button class="chk">Check</button></div>
      <div class="log" role="log" aria-live="polite" aria-label="Conversation"></div>
      <div class="chips" aria-label="Quick questions">
        <button data-say="Wetin dey for screen?">Wetin dey here?</button>
        <button data-say="How much moni dey my account?">My balance</button>
        <button data-say="I wan send moni">Send moni</button>
        <button data-say="Wetin be di charge?">Charge</button>
        <button data-say="Say am again">Say am again</button>
      </div>
      <div class="status" aria-live="assertive"></div>
      <div class="bar">
        <button class="mic" aria-label="Talk to NkapTalk (Alt+Shift+M)" title="Talk (Alt+Shift+M)">${MIC}</button>
        <input type="text" aria-label="Type to NkapTalk" placeholder="Talk or type for Pidgin…" />
        <button class="send">Send</button>
      </div>`;
    root.appendChild(fab);
    root.appendChild(panel);

    log = panel.querySelector('.log');
    input = panel.querySelector('input');
    mic = panel.querySelector('.mic');
    status = panel.querySelector('.status');
    lock = panel.querySelector('.lock');
    modeEl = panel.querySelector('.mode');
    trBtn = panel.querySelector('.tr');

    panel.querySelector('.x').addEventListener('click', () => setOpen(false));
    panel.querySelector('.send').addEventListener('click', sendTyped);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTyped(); e.stopPropagation(); });
    mic.addEventListener('click', toggleMic);
    trBtn.addEventListener('click', () => P.translator.setOn(!P.translator.on));
    panel.querySelector('.chk').addEventListener('click', () => refreshLock(true));
    panel.querySelectorAll('.chips button').forEach((b) => b.addEventListener('click', () => P.assistant.handle({ text: b.dataset.say })));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { P.speech.stop(); P.speech.stopRecording(); } });

    document.addEventListener('keydown', (e) => {
      if (!(e.altKey && e.shiftKey)) return;
      const k = e.key.toLowerCase();
      if (e.code === 'KeyP' || k === 'p') { e.preventDefault(); toggle(); }
      else if (e.code === 'KeyM' || k === 'm') { e.preventDefault(); if (!open) setOpen(true); toggleMic(); }
      else if (e.code === 'KeyT' || k === 't') { e.preventDefault(); P.translator.setOn(!P.translator.on); }
    }, true);

    P.env.on('translate-mode', (on) => { updateTr(on); updateMode(); if (open) refreshLock(false); });
    P.env.on('settings', updateMode);
    updateTr(P.translator.on);
    updateMode();
    setInterval(() => open && refreshLock(false), 3000);
  }

  function updateTr(on) {
    if (!trBtn) return;
    const code = P.translator.language;
    const name = (P.localize && P.localize.LANGUAGES[code] || { name: 'Pidgin' }).name;
    trBtn.textContent = on ? `Page: ${name}` : 'Page: Original';
    trBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    trBtn.setAttribute('aria-label', on ? `Page is in ${name}. Show the original language` : `Page is in the original language. Show ${name}`);
  }

  function updateMode() {
    if (!modeEl) return;
    const s = P.env.settings;
    const base = P.env.online() ? `Gemini ${s.useGeminiNLU ? 'voice' : ''}${s.useGeminiTranslate ? ' + new text (values hidden)' : ''}` : 'Local mode · nothing leaves dis computer';
    const code = P.translator.language;
    const local = code !== 'pcm' && P.localize && P.localize.LANGUAGES[code];
    // the voice is no longer always Pidgin: say which one is actually set, and say when a
    // language is chosen but has no recordings, because then it still speaks Pidgin
    const vcode = P.env.settings.voiceLanguage || 'pcm';
    const voices = P.clipvoice && P.clipvoice.VOICES;
    const vname = vcode === 'pcm' ? 'Pidgin' : ((voices && voices[vcode] && voices[vcode].name) || vcode);
    const clips = P.clipvoice && P.clipvoice.installed;
    const voicePart = vcode === 'pcm' ? 'voice in Pidgin'
      : clips ? `voice in ${vname}` : `voice in ${vname} once it is recorded, Pidgin until then`;
    modeEl.textContent = local ? `${base} · page in ${local.name}, ${voicePart}`
      : (vcode === 'pcm' ? base : `${base} · ${voicePart}`);
  }

  function refreshLock(announce) {
    const a = P.translator.audit();
    const bad = a.broken.length > 0;
    lock.classList.toggle('bad', bad);
    lock.querySelector('.s').textContent = bad
      ? `⚠ ${a.broken.length} value(s) changed — original restored`
      : `🔒 ${a.values} values locked in ${a.texts} translated texts · 0 changed`;
    if (bad) P.translator.setOn(false);
    if (announce) P.assistant.say(bad ? 'Some value change. I don put back di original page.' : `I check am: ${a.values} values, none of dem change.`);
  }

  function setOpen(v) {
    open = v;
    panel.classList.toggle('open', v);
    fab.setAttribute('aria-pressed', v ? 'true' : 'false');
    if (v) {
      refreshLock(false);
      P.assistant.activate();
      setTimeout(() => mic.focus(), 50);
    } else {
      P.assistant.deactivate();
      fab.focus();
    }
  }

  function toggle() { setOpen(!open); }

  function sendTyped() {
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    P.assistant.handle({ text: t });
  }

  async function toggleMic() {
    if (recording) { P.speech.stopRecording(); return; }
    P.speech.stop();
    recording = true;
    mic.classList.add('rec');
    mic.setAttribute('aria-label', 'Stop listening');
    setStatus('listening');
    try {
      const s = P.env.settings;
      if (P.env.online() && s.useGeminiNLU) {
        const audio = await P.speech.record({ onLevel: (l) => mic.style.setProperty('--lvl', Math.min(1, l * 6).toFixed(2)) });
        stopRec();
        if (!audio) { setStatus('idle'); return P.assistant.say('I no hear anything. Press di mic and talk again.'); }
        await P.assistant.handle({ audio });
      } else {
        const text = await P.speech.listen();
        stopRec();
        if (!text) { setStatus('idle'); return P.assistant.say('I no hear anything. Press di mic and talk again, or type am.'); }
        await P.assistant.handle({ text });
      }
    } catch (e) {
      stopRec();
      console.warn('[NkapTalk] mic', e);
      P.assistant.say('I no fit use di microphone. Allow di microphone for dis site, or type am.');
    }
  }

  function stopRec() {
    recording = false;
    mic.classList.remove('rec');
    mic.style.setProperty('--lvl', 0);
    mic.setAttribute('aria-label', 'Talk to NkapTalk (Alt+Shift+M)');
  }

  function addMessage(who, text) {
    if (!log) return;
    const m = el('div', { class: `msg ${who}` });
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  }

  function setStatus(s) {
    if (!status) return;
    status.textContent = s === 'listening' ? '🎙 NkapTalk dey listen… talk now' : s === 'thinking' ? '… NkapTalk dey think' : '';
  }

  P.ui = { mount, addMessage, setStatus, setOpen, toggle, toggleMic, get open() { return open; } };
})();
