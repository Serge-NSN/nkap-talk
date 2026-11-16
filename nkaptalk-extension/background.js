/*
 * NkapTalk — background worker: the only part that talks to Gemini.
 * What it receives:
 *   translate: interface text with every value replaced by ⟦1⟧, ⟦2⟧... (no amounts, names, phones)
 *   nlu:       the user's own voice or typed words + what NkapTalk just asked (never the screen)
 *   tts:       reply text to speak (only if the user turned on "Gemini voice")
 *   translate-local: same masked interface text, into a Cameroonian local language (page only)
 */
importScripts('content/localize.js');
const LANGS = globalThis.NkapTalk.localize.LANGUAGES;
const DEFAULTS = {
  apiKey: '', model: 'gemini-2.5-flash', ttsModel: 'gemini-2.5-flash-preview-tts',
  useGeminiNLU: true, useGeminiTranslate: true, useGeminiTTS: false,
};

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
}

async function gemini(model, body, key) {
  const res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  return data;
}

function textOf(data) {
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || '').join('');
}

function fastConfig(model) {
  // turn off "thinking" where the model allows it: NkapTalk needs quick answers
  return /2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
}

async function translate({ items, glossary, examples }, s) {
  const prompt = [
    'You translate the text of a banking app from French or English into Cameroonian Pidgin English (as spoken in Bamenda and Buea).',
    'Strict rules:',
    '1. Placeholders like ⟦1⟧ stand for amounts, names, phone numbers and references. Copy every placeholder exactly, once each. Never translate, move into words, add or remove them.',
    '2. Keep the exact meaning. Never add or drop information. Keep financial actions exact: send, confirm, cancel, validate.',
    '3. Never soften a warning or security message: keep "never", "do not", "always" strong ("no ever", "no", "every time").',
    '4. Use simple, natural Pidgin people use every day, close to the original length. Use the glossary.',
    '5. Return only a JSON array of strings, same order and same count as the input.',
    `Glossary (English -> Pidgin): ${JSON.stringify(glossary || {})}`,
    `Examples (source -> Pidgin): ${JSON.stringify((examples || []).slice(0, 40))}`,
    `Input: ${JSON.stringify(items)}`,
  ].join('\n');
  const data = await gemini(s.model, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
      ...fastConfig(s.model),
    },
  }, s.apiKey);
  const arr = JSON.parse(textOf(data));
  if (!Array.isArray(arr) || arr.length !== items.length) throw new Error('bad translation shape');
  return arr;
}

// ---------- Local languages (what the page shows; the voice stays Pidgin) ----------

const CACHE_MAX = 3000; // masked strings per language; they hold no values
const cacheKey = (lang) => `lt:${lang}`;

async function localCache(lang) {
  const k = cacheKey(lang);
  return (await chrome.storage.local.get({ [k]: {} }))[k] || {};
}

async function saveLocal(lang, add) {
  const cache = { ...(await localCache(lang)), ...add };
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX) keys.slice(0, keys.length - CACHE_MAX).forEach((x) => delete cache[x]);
  await chrome.storage.local.set({ [cacheKey(lang)]: cache });
}

async function translateLocal({ lang, items, pidgin }, s) {
  const L = LANGS[lang];
  if (!L || lang === 'pcm') throw new Error('unknown language');
  const cache = await localCache(lang);
  const missing = items.filter((m) => typeof cache[m] !== 'string');
  if (missing.length) {
    const prompt = [
      `You translate the text of a Cameroonian banking app from French or English into ${L.full}, as spoken in ${L.where}.`,
      'People will use this to manage real money, so accuracy matters more than style.',
      'Strict rules:',
      '1. Placeholders like ⟦1⟧ stand for amounts, names, phone numbers, dates and references. Copy every placeholder exactly, once each. Never translate them, never move them into words, never add or remove any.',
      '2. Never write any number yourself, in digits or in words. All numbers are already inside placeholders.',
      '3. Keep the exact meaning. Never add or drop information. Keep financial actions exact: send, confirm, cancel, validate, fee, balance, total.',
      '4. Never soften a warning or security message: "never", "do not", "always" must stay just as strong.',
      '5. Write in the standard orthography of the language (General Alphabet of Cameroon Languages), with its special letters and tone marks where they are normally written.',
      '6. If there is no common word for a banking term (account, transfer, PIN, Mobile Money...), keep the French or English term the way speakers really say it. Never invent a word.',
      '7. Keep brand names as they are: Safinum, Safinum Pay, MTN MoMo, Orange Money, NkapTalk.',
      '8. Keep it short and close to the original length: these are buttons, labels and messages.',
      '9. Return only a JSON array of strings, same order and same count as the input.',
      pidgin && pidgin.length ? `Reviewed Pidgin version of some lines, to help with meaning (source -> Pidgin): ${JSON.stringify(pidgin.slice(0, 40))}` : '',
      `Input: ${JSON.stringify(missing)}`,
    ].filter(Boolean).join('\n');
    const data = await gemini(s.model, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
        ...fastConfig(s.model),
      },
    }, s.apiKey);
    const arr = JSON.parse(textOf(data));
    if (!Array.isArray(arr) || arr.length !== missing.length) throw new Error('bad translation shape');
    // only cache answers whose placeholders are intact; the page checks values again
    const add = {};
    missing.forEach((m, i) => {
      const out = typeof arr[i] === 'string' ? arr[i].trim() : '';
      const ph = (x) => (x.match(/⟦\d+⟧/g) || []).sort().join();
      if (out && ph(out) === ph(m) && !/\d/.test(out.replace(/⟦\d+⟧/g, ''))) { add[m] = out; cache[m] = out; }
    });
    if (Object.keys(add).length) await saveLocal(lang, add);
  }
  return items.map((m) => (typeof cache[m] === 'string' ? cache[m] : null));
}

async function nlu({ text, audio, awaiting, lastQuestion, intents }, s) {
  const prompt = [
    'You are the ear of NkapTalk, a voice assistant that helps people use a bank website in Cameroonian Pidgin.',
    'The user speaks Cameroonian Pidgin and may mix in English or French. Understand them and fill the JSON.',
    `NkapTalk just said: ${JSON.stringify(lastQuestion || '')}`,
    `NkapTalk is waiting for: ${awaiting || 'nothing in particular'}`,
    'Fields:',
    '- heard: exactly what the user said, written as they said it.',
    `- intent: one of ${intents.join(', ')}. BALANCE = asks how much money is in the account. HISTORY = past transactions. FEES = asks about charges/fees. TRANSFER = wants to send money. READ_SCREEN = asks what is on the screen or what something means. CONTINUE/BACK/EDIT/CONFIRM = navigation. REPEAT/SLOW/STOP/HELP = conversation control. GREET = greeting. OFF_TOPIC = anything not about their bank or this app. Use null if the user only answers NkapTalk\'s question.`,
    '- amount: money amount in FCFA as a whole number, only if the user said one. If you are not sure of the amount (unknown slang, unclear audio), use null and set unclear to true. Never guess.',
    '- transfer_type: safinum | mobile_money | other_bank, only if said.',
    '- name: the receiver\'s name exactly as said, only if said. Never invent one.',
    '- phone: the phone number digits as said, only if said.',
    '- reason: the reason for sending, only if NkapTalk is waiting for reason.',
    '- answer: yes | no | none — whether the user is saying yes or no to NkapTalk.',
    '- unclear: true if you could not understand well.',
    text ? `The user typed: ${JSON.stringify(text)}` : 'The user\'s voice is attached.',
  ].join('\n');
  const parts = [{ text: prompt }];
  if (audio) parts.push({ inline_data: { mime_type: 'audio/wav', data: audio } });
  const data = await gemini(s.model, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          heard: { type: 'STRING' },
          intent: { type: 'STRING', nullable: true },
          amount: { type: 'NUMBER', nullable: true },
          transfer_type: { type: 'STRING', nullable: true },
          name: { type: 'STRING', nullable: true },
          phone: { type: 'STRING', nullable: true },
          reason: { type: 'STRING', nullable: true },
          answer: { type: 'STRING', enum: ['yes', 'no', 'none'] },
          unclear: { type: 'BOOLEAN' },
        },
        required: ['heard', 'answer', 'unclear'],
      },
      ...fastConfig(s.model),
    },
  }, s.apiKey);
  const r = JSON.parse(textOf(data));
  if (r.answer === 'none') r.answer = null;
  return r;
}

async function tts({ text }, s) {
  const data = await gemini(s.ttsModel, {
    contents: [{ parts: [{ text: `Say this in a warm, clear Cameroonian Pidgin accent, at a calm pace: ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  }, s.apiKey);
  const part = data.candidates[0].content.parts.find((p) => p.inlineData || p.inline_data);
  const inline = part.inlineData || part.inline_data;
  const rate = Number(((inline.mimeType || inline.mime_type || '').match(/rate=(\d+)/) || [])[1]) || 24000;
  return { audio: inline.data, sampleRate: rate };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const s = await settings();
    // saved local translations work without a key (offline)
    if (msg.type === 'local-cache') return { ok: true, cache: await localCache(msg.lang) };
    if (!s.apiKey) return { ok: false, error: 'no-api-key' };
    try {
      if (msg.type === 'translate') {
        if (!s.useGeminiTranslate) return { ok: false, error: 'disabled' };
        return { ok: true, translations: await translate(msg, s) };
      }
      if (msg.type === 'translate-local') {
        if (!s.useGeminiTranslate) return { ok: false, error: 'disabled' };
        return { ok: true, translations: await translateLocal(msg, s) };
      }
      if (msg.type === 'nlu') {
        if (!s.useGeminiNLU) return { ok: false, error: 'disabled' };
        return { ok: true, result: await nlu(msg, s) };
      }
      if (msg.type === 'tts') {
        if (!s.useGeminiTTS) return { ok: false, error: 'disabled' };
        return { ok: true, ...(await tts(msg, s)) };
      }
      return { ok: false, error: 'unknown-message' };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  })().then(sendResponse);
  return true; // async response
});

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' }).catch(() => {});
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});
