/*
 * NkapTalk — page translator.
 * Translates the page's text into Pidgin in place, without touching the page's code,
 * form fields or values. Watches the page so new or changed text is translated at once.
 *
 * Order of trust for each text:
 *   1. Pidgin phrasebook (offline, reviewed)          -> "phrasebook"
 *   2. Gemini, with every value masked out (optional)  -> "ai"
 *   3. Security/error text with no translation         -> Pidgin warning + original text kept
 *   4. Anything else unknown                           -> original text kept
 * Every result must carry exactly the same values as the source, or the original stays.
 *
 * Local languages (Ewondo, Duala, Fulfulde...): the page can SHOW a local language
 * while NkapTalk keeps SPEAKING Pidgin. Each text keeps its Pidgin version (for the voice,
 * from translateSync) and gets a display version:
 *   1. native-speaker correction from settings          -> "fix"
 *   2. Gemini, values masked out, checked like Pidgin    -> "local"
 *   3. not ready yet / offline                           -> the Pidgin version is shown
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});
  const V = () => P.values;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'TEMPLATE', 'IFRAME', 'TITLE']);
  const WARNING_RE = /(sécurité|securite|security|alerte|alert|attention|warning|avertissement|erreur|error|danger|fraude|fraud|jamais|never|ne (?:partagez|communiquez|donnez|divulguez)|do not share|don't share|\bpin\b|mot de passe|password|\botp\b|bloqu|blocked|suspendu|suspended|expir)/i;
  const WARN_PREFIX = '⚠ Warning — read dis one well:';

  const recs = new Map(); // text node -> { orig, out, how }
  const cache = new Map(); // masked source -> masked Pidgin (from AI); holds no values
  const pending = new Map(); // masked source -> [{ node, orig, tokens }]
  let on = false;
  let observer = null;
  let flushTimer = null;
  let initialScanDone = false;
  const stats = { phrasebook: 0, pattern: 0, ai: 0, warning: 0, local: 0, fix: 0, lexicon: 0, draft: 0, untranslated: new Set() };

  // ---- display language (the voice is always Pidgin)
  const L = () => P.localize;
  let lang = 'pcm';
  let fixes = new Map(); // corrections from native speakers, for `lang`
  const localCache = new Map(); // masked source -> masked local text (holds no values)
  const localPending = new Map(); // masked source -> [{ node, orig, tokens }]
  let localTimer = null;
  const isLocal = () => lang !== 'pcm' && !!L() && !!L().LANGUAGES[lang];

  /** Display text in the local language, or null (then Pidgin is shown). */
  function localSync(core) {
    if (!isLocal()) return null;
    const f = L().lookupFix(fixes, core);
    if (f) return { text: f, how: 'fix' };
    // reviewed lexicon that ships with the extension: no key, no internet
    if (P.localbook) {
      const lx = P.localbook.lookup(core, !!P.env.settings.showDrafts);
      if (lx) { stats[lx.how] = (stats[lx.how] || 0) + 1; return { text: lx.text, how: lx.how }; }
    }
    const { masked, tokens } = V().mask(core);
    if (localCache.has(masked)) {
      const t = L().accept(core, masked, localCache.get(masked), tokens);
      if (t) return { text: t, how: 'local' };
    }
    return null;
  }

  function queueLocal(node, orig, core) {
    if (!isLocal() || !P.env.online() || !P.env.settings.useGeminiTranslate) return;
    const { masked, tokens } = V().mask(core);
    if (localCache.has(masked)) return; // known, but failed the checks: keep Pidgin
    if (!localPending.has(masked)) localPending.set(masked, []);
    localPending.get(masked).push({ node, orig, tokens });
    clearTimeout(localTimer);
    localTimer = setTimeout(flushLocal, 350);
  }

  async function flushLocal() {
    if (!localPending.size || !isLocal()) { localPending.clear(); return; }
    const forLang = lang;
    const batch = new Map(localPending);
    localPending.clear();
    const items = [...batch.keys()];
    // reviewed Pidgin of these lines helps Gemini get the meaning right
    const pidgin = [];
    for (const [masked, list] of batch) {
      const r = P.phrasebook.lookup(list[0].orig.trim());
      if (r && pidgin.length < 40) pidgin.push([masked, V().mask(r.text).masked]);
    }
    const res = await P.env.send({ type: 'translate-local', lang: forLang, items, pidgin });
    if (forLang !== lang) return; // language changed meanwhile
    if (!res || !res.ok || !Array.isArray(res.translations)) {
      console.warn('[NkapTalk] local-language translation unavailable:', res && res.error);
      return;
    }
    items.forEach((masked, i) => {
      const out = res.translations[i];
      if (typeof out !== 'string') return;
      localCache.set(masked, out.trim());
      for (const { node, orig, tokens } of batch.get(masked)) {
        if (!node.isConnected || originalOf(node) !== orig) continue;
        const text = L().accept(orig.trim(), masked, out, tokens);
        if (!text) { console.warn('[NkapTalk] local translation changed a value, kept Pidgin:', masked, '->', out); continue; }
        stats.local++;
        if (on) write(node, { orig, out: wrapSpaces(orig, text), how: 'local' });
      }
    });
  }

  async function loadLanguage(code) {
    lang = code && L() && L().LANGUAGES[code] ? code : 'pcm';
    if (P.localbook && !isLocal()) await P.localbook.load('pcm');
    if (P.replybook && !isLocal()) await P.replybook.load('pcm');
    localCache.clear();
    localPending.clear();
    fixes = new Map();
    if (!isLocal()) return;
    const key = `fix:${lang}`;
    const got = await P.env.getLocal({ [key]: '' });
    fixes = L().parseFixes(got[key]).table;
    if (P.localbook) await P.localbook.load(lang);
    if (P.replybook) await P.replybook.load(lang);
    const res = await P.env.send({ type: 'local-cache', lang });
    if (res && res.ok && res.cache) for (const [k, v] of Object.entries(res.cache)) if (typeof v === 'string') localCache.set(k, v);
  }

  /** Switch the display language and redraw the page from its original text. */
  async function setLanguage(code) {
    for (const [node, r] of recs) if (node.isConnected && node.nodeValue === r.out) node.nodeValue = r.orig;
    recs.clear();
    await loadLanguage(code);
    if (on) scan();
    P.env.emit('translate-mode', on);
  }

  function isOurs(el) {
    return !!(el && el.closest && el.closest('#nkaptalk-root'));
  }

  function skippable(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (SKIP_TAGS.has(e.tagName)) return true;
      if (e.id === 'nkaptalk-root') return true;
      if (e.isContentEditable) return true;
      if (e.getAttribute && (e.getAttribute('translate') === 'no' || e.classList.contains('notranslate'))) return true;
      if (e.namespaceURI === 'http://www.w3.org/2000/svg') return true;
    }
    return false;
  }

  function originalOf(node) {
    const r = recs.get(node);
    return r && node.nodeValue === r.out ? r.orig : node.nodeValue;
  }

  /** Text of an element as the page wrote it (before NkapTalk translated it). */
  function origText(el) {
    if (!el) return '';
    if (el.nodeType === 3) return originalOf(el);
    const parts = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.parentElement && (SKIP_TAGS.has(n.parentElement.tagName) || isOurs(n.parentElement))) continue;
      parts.push(originalOf(n));
    }
    return parts.join(' ').replace(/[\s ]+/g, ' ').trim();
  }

  /** Synchronous translation of one string, or null. */
  function translateSync(core) {
    if (!V().hasWords(core) || V().isLikelyName(core)) return null;
    const r = P.phrasebook.lookup(core);
    if (r && V().sameValues(core, r.text)) return r;
    const { masked, tokens } = V().mask(core);
    if (cache.has(masked)) {
      const out = V().unmask(cache.get(masked), tokens);
      if (V().sameValues(core, out)) return { text: out, how: 'ai' };
    }
    return null;
  }

  function write(node, rec) {
    recs.set(node, rec);
    if (node.nodeValue !== rec.out) node.nodeValue = rec.out;
  }

  function wrapSpaces(orig, core) {
    const lead = orig.match(/^\s*/)[0];
    const trail = orig.match(/\s*$/)[0];
    return lead + core + trail;
  }

  /** Returns a record describing what happened to this node (for announcements). */
  function processNode(node, fromObserver) {
    if (!node.parentElement || skippable(node.parentElement)) return null;
    const cur = node.nodeValue;
    const old = recs.get(node);
    if (old && cur === old.out) return null; // our own text
    const orig = cur;
    const core = orig.trim();
    if (!core) { recs.delete(node); return null; }
    if (!V().hasWords(core) || V().isLikelyName(core)) { recs.delete(node); return { orig: core, how: 'value', node }; }

    // names caught by phrasebook patterns ("Bonjour, Amina") are values: lock them so
    // they are never sent to Gemini or changed by a translation
    for (const [re] of P.phrasebook.PATTERNS) {
      const m = core.match(re);
      if (m && m[1]) V().addUserValue(m[1]);
    }

    // local language for the eyes (if chosen and ready); Pidgin stays the voice
    let shown = false;
    if (isLocal()) {
      const loc = localSync(core);
      if (loc) {
        if (on) write(node, { orig, out: wrapSpaces(orig, loc.text), how: loc.how });
        stats[loc.how]++;
        shown = true;
      } else if (on) queueLocal(node, orig, core);
    }

    const res = translateSync(core);
    if (res) {
      if (on && !shown) write(node, { orig, out: wrapSpaces(orig, res.text), how: res.how });
      stats[res.how] = (stats[res.how] || 0) + 1;
      return { orig: core, out: res.text, how: res.how, node };
    }
    // Unknown text
    const { masked, tokens } = V().mask(core);
    const useAI = P.env.online() && P.env.settings.useGeminiTranslate;
    if (useAI) {
      if (!pending.has(masked)) pending.set(masked, []);
      pending.get(masked).push({ node, orig, tokens });
      scheduleFlush();
    }
    const warn = WARNING_RE.test(core);
    if (warn && on && !shown) {
      // Never leave a warning unexplained: Pidgin prefix + the exact original words.
      write(node, { orig, out: wrapSpaces(orig, `${WARN_PREFIX} ${core}`), how: 'warning' });
      stats.warning++;
    }
    stats.untranslated.add(core);
    return { orig: core, out: warn ? `${WARN_PREFIX} ${core}` : null, how: warn ? 'warning' : 'unknown', node, waitingAI: useAI };
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushAI, 350);
  }

  async function flushAI() {
    if (!pending.size) return;
    const batch = new Map(pending);
    pending.clear();
    const items = [...batch.keys()];
    const res = await P.env.send({
      type: 'translate',
      items,
      glossary: P.phrasebook.GLOSSARY,
      examples: P.phrasebook.ENTRIES.filter((e) => !e[0].includes('{}')).slice(0, 40),
    });
    if (!res || !res.ok || !Array.isArray(res.translations)) {
      console.warn('[NkapTalk] AI translation unavailable:', res && res.error);
      return;
    }
    const done = [];
    items.forEach((masked, i) => {
      const out = res.translations[i];
      if (typeof out !== 'string' || !out.trim()) return;
      if (!V().placeholdersMatch(masked, out)) {
        console.warn('[NkapTalk] AI changed a value placeholder, rejected:', masked, '->', out);
        return;
      }
      cache.set(masked, out.trim());
      for (const { node, orig, tokens } of batch.get(masked)) {
        if (!node.isConnected || originalOf(node) !== orig) continue;
        const text = V().unmask(out.trim(), tokens);
        if (!V().sameValues(orig.trim(), text)) continue; // final guard
        stats.untranslated.delete(orig.trim());
        stats.ai++;
        const r = recs.get(node);
        const showingLocal = r && (r.how === 'local' || r.how === 'fix') && node.nodeValue === r.out;
        if (on && !showingLocal) write(node, { orig, out: wrapSpaces(orig, text), how: 'ai' });
        done.push({ orig: orig.trim(), out: text, how: 'ai', node });
      }
    });
    if (done.length) P.env.emit('translated-late', done);
  }

  function collectInputs(root) {
    (root || document).querySelectorAll('input, textarea').forEach((i) => {
      const t = (i.type || '').toLowerCase();
      if (['password', 'hidden', 'checkbox', 'radio', 'number', 'submit', 'button'].includes(t)) return;
      if (/pin|otp|password|code/i.test(i.name + i.id + i.autocomplete)) return;
      V().addUserValue(i.value);
    });
  }

  function walk(root, fromObserver, results) {
    if (root.nodeType === 3) {
      const r = processNode(root, fromObserver);
      if (r) results.push(r);
      return;
    }
    if (root.nodeType !== 1 || skippable(root)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach((t) => {
      const r = processNode(t, fromObserver);
      if (r) results.push(r);
    });
  }

  function scan() {
    collectInputs();
    const results = [];
    walk(document.body, false, results);
    initialScanDone = true;
    return results;
  }

  function onMutations(records) {
    collectInputs();
    const results = [];
    const seen = new Set();
    for (const r of records) {
      if (r.type === 'characterData') {
        if (seen.has(r.target)) continue;
        seen.add(r.target);
        if (isOurs(r.target.parentElement)) continue;
        const x = processNode(r.target, true);
        if (x) results.push(x);
      } else {
        r.addedNodes.forEach((n) => {
          if (seen.has(n) || (n.nodeType === 1 && isOurs(n))) return;
          seen.add(n);
          walk(n, true, results);
        });
      }
    }
    if (results.length) P.env.emit('new-text', results);
  }

  async function start() {
    if (observer) return;
    await loadLanguage(P.env.settings.pageLanguage);
    if (observer) return;
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && !/password|hidden/i.test(t.type)) V().addUserValue(t.value);
    }, true);
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    scan();
  }

  function setOn(v) {
    on = !!v;
    if (on) {
      scan();
    } else {
      for (const [node, r] of recs) if (node.isConnected && node.nodeValue === r.out) node.nodeValue = r.orig;
      recs.clear();
    }
    P.env.emit('translate-mode', on);
  }

  /** Re-checks every translated text: values must be identical to the page's own. */
  function audit() {
    let texts = 0, values = 0;
    const broken = [];
    for (const [node, r] of recs) {
      if (!node.isConnected) { recs.delete(node); continue; }
      if (node.nodeValue !== r.out) continue;
      texts++;
      if (!V().sameValues(r.orig, r.out)) broken.push(r.orig);
    }
    // every value shown on the page: in translated sentences or standing alone (never touched)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!n.parentElement || skippable(n.parentElement)) continue;
      values += V().values(originalOf(n)).length;
    }
    return { texts, values, broken, untranslated: [...stats.untranslated] };
  }

  P.translator = {
    start, setOn, scan, audit, origText, originalOf, translateSync,
    get on() { return on; },
    get language() { return lang; },
    setLanguage,
    flushLocal,
    get stats() { return stats; },
    isWarning: (t) => WARNING_RE.test(t),
    WARN_PREFIX,
    flushAI,
  };
})();
