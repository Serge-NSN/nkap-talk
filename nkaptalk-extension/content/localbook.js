/*
 * NkapTalk — offline lexicon for a local language.
 *
 * Pidgin has a reviewed phrasebook built into the extension, so the page works with no key
 * and no internet. This gives Ewondo, Duala, Fulfulde and the rest the same thing: a file
 * per language in lexicon/, filled in by native speakers.
 *
 * A line is shown only when a speaker has marked it reviewed. An unreviewed draft, however
 * plausible, falls back to Pidgin instead, because the person reading it is moving money.
 * The "show unreviewed drafts" setting lifts that, for testing and for demonstrations.
 *
 * Value safety is the same as for Pidgin and for Gemini: the page's own values are put back
 * into the slots and the result is compared against the source. If anything about the values
 * differs, the line is dropped and Pidgin is shown.
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});
  const V = () => P.values;

  let lang = null;
  let table = new Map(); // shape of the source -> { out, reviewed, by }
  let counts = { lines: 0, filled: 0, reviewed: 0 };

  const norm = (s) => (P.phrasebook ? P.phrasebook.norm(s) : String(s).trim().toLowerCase());
  const shapeOfMasked = (masked) => norm(masked.replace(/⟦\d+⟧/g, '{}'));

  /** Same shaping as the Pidgin phrasebook, so the two match text the same way. */
  function shapeOfSource(src) {
    const masked = src.split('{}').map((frag) => V().mask(frag).masked).join('⟦0⟧');
    return shapeOfMasked(masked);
  }

  const url = (p) =>
    (globalThis.chrome && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('lexicon/' + p)
      : 'lexicon/' + p;

  /** Load one language's lexicon. Safe to call repeatedly; "pcm" clears it. */
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
    const entries = (data && data.entries) || [];
    for (const e of entries) {
      counts.lines++;
      if (!e || !e.src || !e.out) continue;
      counts.filled++;
      if (e.reviewed) counts.reviewed++;
      const shape = shapeOfSource(e.src);
      if (!table.has(shape)) table.set(shape, { out: e.out, reviewed: !!e.reviewed, by: e.by || '' });
    }
    return counts;
  }

  /**
   * Translation of one page string, with the page's own values filled in, or null.
   * Unreviewed lines are withheld unless `allowDrafts`.
   */
  function lookup(core, allowDrafts = false) {
    if (!table.size) return null;
    const trimmed = String(core).trim();
    const { masked, tokens } = V().mask(trimmed);
    const hit = table.get(shapeOfMasked(masked));
    if (!hit) return null;
    if (!hit.reviewed && !allowDrafts) return null;
    const text = hit.out.replace(/\{(\d+)\}/g, (m, n) => {
      const t = tokens[Number(n) - 1];
      return t ? t.value : m;
    });
    if (!V().sameValues(trimmed, text)) return null;
    return { text, how: hit.reviewed ? 'lexicon' : 'draft', by: hit.by };
  }

  P.localbook = {
    load,
    lookup,
    shapeOfSource,
    get language() { return lang; },
    get counts() { return { ...counts }; },
  };
})();
