/*
 * NkapTalk — what NkapTalk itself says, in the chosen language.
 *
 * assistant.js writes every reply in Pidgin and fills in the values from the screen. This
 * swaps the Pidgin pieces for a local language while leaving the values exactly as they are,
 * so choosing Ewondo means NkapTalk answers in Ewondo instead of answering in Pidgin about
 * an Ewondo page.
 *
 * What is SAID aloud stays the Pidgin text. A browser voice reading Ewondo would mangle it,
 * and the recordings are keyed by the Pidgin piece anyway, so speech.js keeps receiving
 * Pidgin and plays the local recording when there is one.
 *
 * A reply is swapped whole or not at all. Half a sentence in one language and half in another
 * is worse than leaving it in Pidgin, and a line no speaker has checked is not shown at all.
 * The values are put back untouched and compared, exactly as everywhere else: if anything
 * about them differs, the Pidgin reply is used.
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});
  const V = () => P.values;

  let lang = null;
  let table = new Map(); // normalised Pidgin piece -> { out, reviewed }
  let counts = { lines: 0, filled: 0, reviewed: 0 };

  const norm = (s) => (P.clipvoice ? P.clipvoice.norm(s) : String(s).trim().toLowerCase());

  const url = (p) =>
    (globalThis.chrome && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('lexicon/replies/' + p)
      : 'lexicon/replies/' + p;

  async function load(code) {
    if (code === lang) return counts;
    lang = code;
    table = new Map();
    counts = { lines: 0, filled: 0, reviewed: 0 };
    if (!code || code === 'pcm') return counts;
    let data = null;
    try {
      const res = await fetch(url(code + '.json'));
      if (res.ok) data = await res.json();
    } catch (e) { data = null; }
    for (const e of (data && data.entries) || []) {
      counts.lines++;
      if (!e || !e.pidgin || !e.out) continue;
      counts.filled++;
      if (e.reviewed) counts.reviewed++;
      const k = norm(e.pidgin);
      if (!table.has(k)) table.set(k, { out: e.out, reviewed: !!e.reviewed });
    }
    return counts;
  }

  /**
   * A Pidgin reply, values and all, in the chosen language. null when it cannot be done
   * completely, and then the caller shows the Pidgin.
   */
  function localize(text, allowDrafts = false) {
    if (!table.size || !text) return null;
    const spans = (V() && V().findSpans) ? V().findSpans(text) : [];
    let out = '';
    let pos = 0;
    const piece = (raw) => {
      const core = norm(raw);
      if (!core) return raw; // spaces and punctuation carry no words
      const hit = table.get(core);
      if (!hit || (!hit.reviewed && !allowDrafts)) return null;
      // Pad with spaces rather than copying the Pidgin spacing. A piece can start with the
      // punctuation that ended the previous sentence, and taking the spacing literally glued
      // the translation onto the value before it, turning "250 000 FCFA" into something the
      // value check then rightly refused. The padding is collapsed below.
      // keep punctuation that opened the piece, so the sentence before it still ends:
      // ". Account number na " has to stay a full stop, not run the two sentences together
      const lead = (raw.match(/^[^\p{L}\p{N}]*/u) || [''])[0].replace(/\s+/g, '');
      return lead + ' ' + hit.out + ' ';
    };
    for (const s of spans) {
      const t = piece(text.slice(pos, s.start));
      if (t === null) return null;
      out += t + s.value; // the value from the screen, untouched
      pos = s.end;
    }
    const last = piece(text.slice(pos));
    if (last === null) return null;
    out += last;
    out = out.replace(/\s+/g, ' ').replace(/\s+([.,;:!?)\]])/g, '$1').replace(/([(\[])\s+/g, '$1').trim();
    if (!out) return null;
    return V().sameValues(text, out) ? out : null;
  }

  P.replybook = {
    load,
    localize,
    get language() { return lang; },
    get counts() { return { ...counts }; },
  };
})();
