/*
 * NkapTalk — recorded native-speaker voice, for Pidgin and for the local languages.
 *
 * Chrome's English voice reads Pidgin spelling, which is only close enough. For Ewondo,
 * Duala, Basaa, Ghomala', Medumba and Lamnso' there is no usable voice at all, because they
 * are tonal: the same syllable at a different pitch is a different word, and no engine today
 * places those tones correctly. Fulfulde is not tonal, so it is the easier case.
 *
 * A recording by a native speaker has the right tones by definition. The problem is that
 * tone is not a property of a word on its own: it shifts with the words around it. So cutting
 * a tonal language into word-sized pieces and gluing them back together can produce a tone,
 * and therefore a word, that nobody said. Two rules follow, and they are enforced below:
 *
 *   1. In a tonal language a whole fragment between two values is one recording. Fragments
 *      are never built up out of word clips. A fragment with no recording is not spoken in
 *      that language at all: it falls back to Pidgin.
 *   2. Only numbers are spliced in, and they are spoken in French (see numerals.js), which
 *      carries no tone. So no splice can ever change a tone, and no amount depends on
 *      numerals we would have had to invent in a language we cannot check.
 *
 * Clips are keyed by the slug of the PIDGIN fragment, while the audio holds the local
 * language. That way the assistant keeps composing replies in Pidgin exactly as it does now,
 * and the voice needs no local-language text at runtime.
 *
 * What is said is never decided here. Values arrive exact from the page and are turned into
 * words by code in numerals.js. This file only chooses which recording says an already
 * decided word, so it can change how a reply sounds, never what it says.
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});

  /**
   * Voices NkapTalk can be recorded in. `numerals` is the set that reads amounts aloud;
   * `tonal` turns on rule 1 above. Pidgin keeps the English number words it uses today.
   */
  const VOICES = {
    pcm: { name: 'Pidgin', numerals: 'en', tonal: false },
    ff: { name: 'Fulfulde', numerals: 'fr', tonal: false },
    ewo: { name: 'Ewondo', numerals: 'fr', tonal: true },
    bum: { name: 'Bulu', numerals: 'fr', tonal: true },
    dua: { name: 'Duala', numerals: 'fr', tonal: true },
    bas: { name: 'Basaa', numerals: 'fr', tonal: true },
    bbj: { name: "Ghomala'", numerals: 'fr', tonal: true },
    byv: { name: 'Medumba', numerals: 'fr', tonal: true },
    lns: { name: "Lamnso'", numerals: 'fr', tonal: true },
  };

  // ---- Closed vocabulary of the Pidgin voice. Kept in step with speech.js by a test.
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const SCALES = ['hundred', 'thousand', 'million', 'billion'];
  const UNITS = ['franc', 'percent', 'point', 'minus', 'plus'];
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const NUMBERS = [...ONES, ...TENS, ...SCALES, ...UNITS, ...LETTERS];

  function hash32(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  /**
   * Filename-safe id for a piece of text. Stable: the recording script uses the same ids.
   * Long text keeps a readable head plus a hash of the whole string, so two different long
   * sentences can never share one file and play each other's recording.
   */
  function slug(text) {
    const clean = String(text)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (clean.length <= 60) return clean;
    return clean.slice(0, 52).replace(/-+$/, '') + '-' + hash32(clean);
  }

  /** Spoken text -> comparable words. Punctuation carries no sound of its own. */
  function norm(text) {
    return String(text)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Words of a phrase. "twenty-one" is two recordings, so hyphens split. */
  function words(text) {
    return norm(text).split(/[\s-]+/).filter(Boolean);
  }

  /**
   * One spoken word -> the word whose clip says it. speech.js reads phone numbers and
   * references character by character ("plus 2 3 7"), so a bare digit arrives as "2". The
   * browser voice says that correctly on its own, but a clip is a file and needs the name
   * "two", so the same ten number recordings serve amounts and digit-by-digit reading.
   */
  function clipWord(w) {
    return /^[0-9]$/.test(w) ? ONES[Number(w)] : w;
  }

  /** Split a reply into sentences. A recording never spans a sentence ender. */
  function sentences(text) {
    return String(text)
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Tile a fragment with the longest recordings available. `have` is a Set of slugs.
   * With `whole`, the fragment must be covered by ONE recording or not at all: that is
   * rule 1, and it is what keeps a tonal language from being glued together word by word.
   * Returns an array of slugs, or null.
   */
  function plan(sentence, have, opts = {}) {
    const maxWords = opts.maxWords || 12;
    const w = words(sentence).map(clipWord);
    if (!w.length) return null;
    if (opts.whole) {
      const s = slug(w.join(' '));
      return have.has(s) ? [s] : null;
    }
    const out = [];
    let i = 0;
    while (i < w.length) {
      let hit = null;
      for (let n = Math.min(maxWords, w.length - i); n >= 1; n--) {
        const s = slug(w.slice(i, i + n).join(' '));
        if (have.has(s)) { hit = { s, n }; break; }
      }
      if (!hit) return null; // one missing word disqualifies the fragment
      out.push(hit.s);
      i += hit.n;
    }
    return out;
  }

  // ---------- Values: exact from the page, turned into words by code ----------
  /** Letter-by-letter reading of a reference or account number. */
  function spellIds(raw, num) {
    const out = [];
    for (const ch of String(raw).replace(/\s+/g, '')) {
      if (/[a-z]/i.test(ch)) out.push(ch.toLowerCase());
      else if (/[0-9]/.test(ch)) out.push(...num.digits(ch));
      else if (ch === '-' || ch === '_') continue;
      else return null;
    }
    return out;
  }

  /** One value from the page -> the recordings that say it, or null. */
  function valueIds(span, num) {
    const v = span.value;
    switch (span.kind) {
      case 'MONEY': {
        const n = v.replace(/(FCFA|F\s?CFA|XAF|CFA|francs?)/i, '').trim();
        const w = num.words(n);
        return w ? [...w, num.currency] : null;
      }
      case 'PERCENT': {
        const w = num.words(v.replace('%', '').trim());
        return w ? [...w, ...num.percent] : null;
      }
      case 'PHONE': return num.digits(v);
      case 'REF': case 'CODE': case 'ACCOUNT': return spellIds(v, num);
      case 'NUMBER': return num.words(v);
      case 'CURRENCY': return /CFA/i.test(v) ? [num.currency] : null;
      default: return null;
    }
  }

  /**
   * One sentence of a reply, with its exact values, -> the recordings that say it in `lang`,
   * or null if the recordings cannot carry it and the browser voice must take the sentence.
   */
  function planSentence(sentence, lang, have) {
    const voice = VOICES[lang] || VOICES.pcm;
    const num = P.numerals ? P.numerals.get(voice.numerals) : null;
    if (!num) return null;
    const spans = (P.values && P.values.findSpans) ? P.values.findSpans(sentence) : [];
    const ids = [];
    let pos = 0;
    const addText = (t) => {
      if (!norm(t)) return true; // punctuation and spacing make no sound
      const got = plan(t, have, { whole: voice.tonal });
      if (!got) return false;
      ids.push(...got);
      return true;
    };
    for (const s of spans) {
      if (!addText(sentence.slice(pos, s.start))) return null;
      const vIds = valueIds(s, num);
      if (!vIds) return null;
      for (const id of vIds) {
        // clipWord here too: a reference or phone number arrives as bare digits from
        // digits()/spellIds(), and a clip is named after the word, not the character
        const sl = slug(clipWord(id));
        if (!have.has(sl)) return null;
        ids.push(sl);
      }
      pos = s.end;
    }
    if (!addText(sentence.slice(pos))) return null;
    return ids.length ? ids : null;
  }

  /** Per sentence: the recordings to play, or the text for the browser voice. */
  function planReply(text, lang, have) {
    return sentences(text).map((sentence) => {
      const ids = planSentence(sentence, lang, have);
      return ids ? { kind: 'clips', ids, text: sentence } : { kind: 'speak', text: sentence };
    });
  }

  /** How much of a reply the recordings can carry, per sentence. For the settings page. */
  function coverage(text, have, lang = 'pcm') {
    const parts = planReply(text, lang, have);
    const done = parts.filter((p) => p.kind === 'clips').length;
    return { total: parts.length, clips: done, ratio: parts.length ? done / parts.length : 0 };
  }

  /** Every recording a language needs for its numbers: the speaker's Tier 1. */
  function numberVocabulary(lang) {
    const voice = VOICES[lang] || VOICES.pcm;
    const num = P.numerals ? P.numerals.get(voice.numerals) : null;
    return num ? [...num.vocabulary(), ...LETTERS] : [...NUMBERS];
  }

  P.clipvoice = {
    VOICES, NUMBERS, ONES, TENS, SCALES, UNITS, LETTERS,
    slug, norm, words, clipWord, sentences, plan,
    valueIds, spellIds, planSentence, planReply, coverage, numberVocabulary,
  };

  // ---------- Playback (browser only; everything above stays testable in Node) ----------
  if (typeof document === 'undefined') return;

  const indexes = new Map(); // lang -> { slug: filename } | null
  let ctx = null;
  const buffers = new Map(); // "lang/slug" -> AudioBuffer
  let playing = [];
  let gen = 0; // bumped by stop(), so an interrupted reply stops scheduling the rest

  const url = (lang, p) =>
    (globalThis.chrome && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL(`audio/${lang}/${p}`)
      : `audio/${lang}/${p}`;

  /** audio/<lang>/index.json maps slug -> real filename, so no format guessing. */
  async function loadIndex(lang) {
    if (indexes.has(lang)) return indexes.get(lang);
    let idx = null;
    try {
      const res = await fetch(url(lang, 'index.json'));
      if (res.ok) idx = await res.json();
    } catch (e) { idx = null; }
    indexes.set(lang, idx);
    return idx;
  }

  async function have(lang = 'pcm') {
    const idx = await loadIndex(lang);
    return new Set(idx ? Object.keys(idx) : []);
  }

  async function buffer(lang, s) {
    const key = lang + '/' + s;
    if (buffers.has(key)) return buffers.get(key);
    const idx = indexes.get(lang);
    const file = idx && idx[s];
    if (!file) return null;
    try {
      const res = await fetch(url(lang, file));
      if (!res.ok) throw new Error(res.status);
      ctx = ctx || new AudioContext();
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      buffers.set(key, buf);
      return buf;
    } catch (e) {
      buffers.set(key, null); // don't retry a bad file on every reply
      return null;
    }
  }

  function stop() {
    gen++;
    playing.forEach((s) => { try { s.stop(); } catch (e) {} });
    playing = [];
  }

  /**
   * Say `text` (exact values inside) from recordings in `lang` where they exist.
   * Returns the sentences it could not play, for the browser voice to say in Pidgin.
   */
  async function speak(text, { lang = 'pcm', rate = 1 } = {}) {
    const my = ++gen;
    const hv = await have(lang);
    if (!hv.size) return [{ text, reason: 'no-clips' }];
    const missed = [];
    for (const part of planReply(text, lang, hv)) {
      if (my !== gen) return missed; // stop() was called: drop the rest of the reply
      if (part.kind !== 'clips') { missed.push({ text: part.text, reason: 'not-recorded' }); continue; }
      const bufs = [];
      for (const id of part.ids) {
        const b = await buffer(lang, id);
        if (!b) break;
        bufs.push(b);
      }
      if (bufs.length !== part.ids.length) { missed.push({ text: part.text, reason: 'load-failed' }); continue; }
      ctx = ctx || new AudioContext();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
      let at = ctx.currentTime + 0.03;
      const speed = Math.max(0.5, Math.min(2, rate));
      for (const b of bufs) {
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.playbackRate.value = speed;
        src.connect(ctx.destination);
        src.start(at);
        playing.push(src);
        at += b.duration / speed;
      }
      await new Promise((r) => setTimeout(r, Math.max(0, (at - ctx.currentTime) * 1000)));
    }
    if (my === gen) playing = [];
    return missed;
  }

  /** True once a language with recordings has been loaded; the panel reports it. */
  Object.defineProperty(P.clipvoice, 'installed', {
    get() {
      const idx = indexes.get(P.env && P.env.settings ? (P.env.settings.voiceLanguage || 'pcm') : 'pcm');
      return !!(idx && Object.keys(idx).length);
    },
  });

  P.clipvoice.speak = speak;
  P.clipvoice.stop = stop;
  P.clipvoice.have = have;
  P.clipvoice.reload = () => { indexes.clear(); buffers.clear(); };
})();
