/*
 * NkapTalk — environment: settings + messages to the background worker.
 * Works without extension APIs too (for testing by injecting the scripts into a page):
 * then everything runs in "local mode" with no network calls.
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});

  const DEFAULTS = {
    apiKey: '',
    model: 'gemini-2.5-flash',
    ttsModel: 'gemini-2.5-flash-preview-tts',
    useGeminiNLU: true, // understand the user's voice with Gemini (audio of the user only)
    useGeminiTranslate: true, // translate NEW unknown text with Gemini (values masked out)
    useGeminiTTS: false, // Gemini voice for replies (sends reply text, which contains values)
    useClipVoice: true, // play recorded native-speaker Pidgin clips when they exist (offline)
    autoTranslate: true, // translate the page as soon as it loads
    pageLanguage: 'pcm', // what the page shows: Pidgin or a local language
    voiceLanguage: 'pcm', // which recorded voice speaks; falls back to Pidgin per sentence
    showDrafts: false, // show lexicon lines no native speaker has checked yet
    rate: 0.95,
    voiceName: '',
  };

  const hasChrome = !!(globalThis.chrome && chrome.runtime && chrome.runtime.id);
  let settings = { ...DEFAULTS };

  async function loadSettings() {
    if (hasChrome && chrome.storage) {
      try {
        const s = await chrome.storage.sync.get(DEFAULTS);
        settings = { ...DEFAULTS, ...s };
      } catch (e) { /* keep defaults */ }
    }
    return settings;
  }

  if (hasChrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') return P.env.emit('local-store', changes);
      for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
      P.env.emit('settings', settings);
    });
  }

  /** chrome.storage.local (corrections for local languages); empty outside the extension. */
  async function getLocal(defaults) {
    if (!(hasChrome && chrome.storage && chrome.storage.local)) return { ...defaults };
    try { return await chrome.storage.local.get(defaults); } catch (e) { return { ...defaults }; }
  }

  function send(msg) {
    if (!hasChrome) return Promise.resolve({ ok: false, error: 'no-extension' });
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(res || { ok: false, error: 'empty' });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  const listeners = {};
  P.env = {
    hasChrome,
    get settings() { return settings; },
    loadSettings,
    send,
    getLocal,
    online() { return hasChrome && !!settings.apiKey; },
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    emit(evt, data) { (listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.warn('[NkapTalk]', e); } }); },
  };
})();
