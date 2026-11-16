const DEFAULTS = {
  apiKey: '', model: 'gemini-2.5-flash', ttsModel: 'gemini-2.5-flash-preview-tts',
  useGeminiNLU: true, useGeminiTranslate: true, useGeminiTTS: false, useClipVoice: true,
  autoTranslate: true, rate: 0.95, voiceName: '', pageLanguage: 'pcm', voiceLanguage: 'pcm',
};
const LOC = globalThis.NkapTalk.localize;
const $ = (id) => document.getElementById(id);
const BOOLS = ['useGeminiNLU', 'useGeminiTranslate', 'useGeminiTTS', 'useClipVoice', 'autoTranslate', 'showDrafts'];

const VOICES = globalThis.NkapTalk.clipvoice.VOICES;

function fillVoiceLanguages(selected) {
  const sel = $('voiceLanguage');
  if (!sel) return;
  sel.length = 0;
  for (const [code, v] of Object.entries(VOICES)) {
    sel.add(new Option(code === 'pcm' ? 'Pidgin' : v.name, code));
  }
  sel.value = selected in VOICES ? selected : 'pcm';
}

/**
 * Say how many recordings are installed for the chosen voice. A language with none, or with
 * an unfinished Tier 1, still answers every question: those sentences are spoken in Pidgin.
 */
async function showClipCount() {
  const note = $('clipNote');
  if (!note) return;
  const lang = ($('voiceLanguage') && $('voiceLanguage').value) || 'pcm';
  const voice = VOICES[lang] || VOICES.pcm;
  try {
    const [idxRes, wantRes] = await Promise.all([
      fetch(chrome.runtime.getURL(`audio/${lang}/index.json`)),
      fetch(chrome.runtime.getURL(`audio/${lang}/wanted.json`)),
    ]);
    const idx = idxRes.ok ? await idxRes.json() : {};
    const want = wantRes.ok ? await wantRes.json() : [];
    const n = Object.keys(idx).length;
    if (!n) {
      note.textContent = `No ${voice.name} recordings installed yet, so every reply is spoken in Pidgin by the browser voice. See audio/${lang}/SCRIPT.md.`;
      return;
    }
    const t1 = want.filter((w) => w.tier === 'numbers');
    const t1have = t1.filter((w) => idx[w.id]).length;
    const amounts = t1.length && t1have === t1.length
      ? 'Amounts are read by the recorded voice.'
      : `Amounts still fall back to Pidgin: ${t1.length - t1have} of the ${t1.length} number recordings are missing.`;
    note.textContent = `${n} ${voice.name} recordings installed. ${amounts} Anything not recorded is spoken in Pidgin instead.`;
  } catch (e) {
    note.textContent = `No ${voice.name} recordings installed yet, so every reply is spoken in Pidgin.`;
  }
}
const TEXTS = ['apiKey', 'model', 'ttsModel'];

function fillVoices(selected) {
  const sel = $('voiceName');
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  sel.length = 1;
  voices.forEach((v) => {
    const o = new Option(`${v.name} (${v.lang})${v.localService ? ' · on this device' : ' · online'}`, v.name);
    sel.add(o);
  });
  sel.value = selected || '';
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  TEXTS.forEach((k) => ($(k).value = s[k]));
  BOOLS.forEach((k) => ($(k).checked = !!s[k]));
  $('rate').value = s.rate;
  $('rateVal').textContent = s.rate;
  fillVoices(s.voiceName);
  fillLanguages(s.pageLanguage);
  fillVoiceLanguages(s.voiceLanguage);
  showLanguage($('pageLanguage').value);
  speechSynthesis.onvoiceschanged = () => fillVoices(s.voiceName);
});

// ---- page language + native-speaker corrections (stored on this computer only)
let shownLang = 'pcm';

function fillLanguages(selected) {
  const sel = $('pageLanguage');
  sel.length = 0;
  for (const [code, l] of Object.entries(LOC.LANGUAGES)) {
    sel.add(new Option(code === 'pcm' ? 'Pidgin (built in, works offline)' : `${l.name} · ${l.where} (needs Gemini)`, code));
  }
  sel.value = selected in LOC.LANGUAGES ? selected : 'pcm';
}

function showLanguage(code) {
  shownLang = code;
  const local = code !== 'pcm';
  ['fixes', 'clearCache'].forEach((id) => ($(id).disabled = !local));
  $('fixesFor').textContent = local ? `(${LOC.LANGUAGES[code].name})` : '(choose a local language)';
  $('langNote').textContent = local
    ? `Gemini translates the page into ${LOC.LANGUAGES[code].name} with every amount, name, phone number and reference hidden first. Until a line is ready, or with no internet, the page shows Pidgin. Gemini's ${LOC.LANGUAGES[code].name} can be wrong: have native speakers check it and add corrections below.`
    : 'Pidgin comes from the reviewed phrasebook, plus Gemini for new text if you added a key.';
  $('fixErrors').textContent = '';
  const k = `fix:${code}`;
  chrome.storage.local.get({ [k]: '' }, (r) => { $('fixes').value = local ? r[k] : ''; });
}

$('pageLanguage').addEventListener('change', () => showLanguage($('pageLanguage').value));
$('voiceLanguage').addEventListener('change', showClipCount);

/** How much of the chosen language a native speaker has already checked. */
async function showLexicon() {
  const note = $('lexNote');
  if (!note) return;
  const lang = $('pageLanguage').value;
  if (lang === 'pcm') { note.textContent = 'Pidgin uses its built-in phrasebook, so it needs no key and no internet.'; return; }
  try {
    const res = await fetch(chrome.runtime.getURL(`lexicon/${lang}.json`));
    const data = res.ok ? await res.json() : { entries: [] };
    const all = data.entries || [];
    const filled = all.filter((e) => e.out).length;
    const reviewed = all.filter((e) => e.out && e.reviewed).length;
    // drafts ship inside the extension, so they need no key; only an empty language does
    const drafts = $('showDrafts') && $('showDrafts').checked;
    if (reviewed) {
      note.textContent = `${reviewed} of ${all.length} lines checked by a native speaker, so those work with no key and no internet.`
        + (filled > reviewed ? ` ${filled - reviewed} more are waiting to be checked.` : '');
    } else if (filled) {
      note.textContent = `No line has been checked by a native speaker yet. ${filled} drafts ship with the extension, so they need no key, `
        + (drafts ? 'and they are showing because the switch below is on.'
                  : 'but they stay hidden until the switch below is on; the page shows Pidgin instead.');
    } else {
      note.textContent = 'Nothing has been translated into this language yet, so the page shows Pidgin unless Gemini is on.';
    }
  } catch (e) {
    note.textContent = 'Could not read this language\'s lexicon.';
  }
}
$('pageLanguage').addEventListener('change', showLexicon);
$('showDrafts').addEventListener('change', showLexicon);

/**
 * Pull the translations Gemini has already produced in this browser into a file that
 * `node tools/build-lexicon.js merge` understands. They come out as drafts: every line
 * still has to be checked by a speaker before NkapTalk will show it by default.
 */
$('exportDrafts').addEventListener('click', async () => {
  const lang = $('pageLanguage').value;
  if (lang === 'pcm') { $('lexNote').textContent = 'Choose a local language first.'; return; }
  const res = await chrome.runtime.sendMessage({ type: 'local-cache', lang });
  const cache = (res && res.ok && res.cache) || {};
  const out = {};
  for (const [masked, translated] of Object.entries(cache)) {
    if (typeof translated !== 'string' || !translated.trim()) continue;
    // ⟦1⟧ marks a value: the source wants {} and the translation wants {1}
    out[masked.replace(/⟦\d+⟧/g, '{}')] = { out: translated.replace(/⟦(\d+)⟧/g, '{$1}'), reviewed: false };
  }
  const n = Object.keys(out).length;
  if (!n) { $('lexNote').textContent = 'No saved Gemini translations to export yet. Open the page in this language first.'; return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `nkaptalk-drafts-${lang}.json`;
  a.click();
  URL.revokeObjectURL(url);
  $('lexNote').textContent = `${n} drafts exported. Merge them with: node tools/build-lexicon.js merge ${lang} nkaptalk-drafts-${lang}.json`;
});

$('clearCache').addEventListener('click', () => {
  chrome.storage.local.remove(`lt:${shownLang}`, () => {
    $('saved').textContent = 'Saved translations forgotten';
    setTimeout(() => ($('saved').textContent = ''), 2500);
  });
});

$('rate').addEventListener('input', () => ($('rateVal').textContent = $('rate').value));

$('save').addEventListener('click', () => {
  const s = {};
  TEXTS.forEach((k) => (s[k] = $(k).value.trim() || DEFAULTS[k]));
  if (!$('apiKey').value.trim()) s.apiKey = '';
  BOOLS.forEach((k) => (s[k] = $(k).checked));
  s.rate = Number($('rate').value);
  s.voiceName = $('voiceName').value;
  s.pageLanguage = $('pageLanguage').value;
  s.voiceLanguage = $('voiceLanguage').value;
  s.showDrafts = $('showDrafts').checked;
  if (s.pageLanguage !== 'pcm') {
    const { errors } = LOC.parseFixes($('fixes').value);
    $('fixErrors').textContent = errors.length ? `Not saved: ${errors.join('; ')}` : '';
    if (errors.length) return;
    chrome.storage.local.set({ [`fix:${s.pageLanguage}`]: $('fixes').value });
  }
  chrome.storage.sync.set(s, () => {
    $('saved').textContent = 'Saved';
    setTimeout(() => ($('saved').textContent = ''), 2000);
  });
});

// show how many recordings are installed next to the toggle
showClipCount();
showLexicon();
