#!/usr/bin/env node
/*
 * NkapTalk — offline lexicons for the local languages.
 *
 *   node tools/build-lexicon.js stub  <lang|--all>        create/refresh the file to fill in
 *   node tools/build-lexicon.js check <lang|--all>        validate and report coverage
 *   node tools/build-lexicon.js merge <lang> <file.json>  fold in translations
 *
 * Pidgin ships a reviewed phrasebook, so the page works offline with no key. This gives the
 * local languages the same thing. The file holds every interface string of the SAFINUM test
 * environment, in French and English, with its reviewed Pidgin alongside so a reviewer can
 * see what the line means.
 *
 * Nothing here invents a translation. `out` starts empty and is filled by native speakers, or
 * by exporting the drafts Gemini already produced in the browser and having speakers check
 * them. Each line carries its own `reviewed` flag and the name of whoever checked it, and by
 * default NkapTalk shows only reviewed lines: an unreviewed line falls back to Pidgin rather
 * than showing a guess to someone moving money.
 *
 * The value rules are the same as everywhere else: {} marks a value in the source, {1}, {2}...
 * put those values back, and a line whose slots do not line up, or that writes a digit of its
 * own, is refused here rather than at runtime.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'nkaptalk-extension');
const DIR = path.join(EXT, 'lexicon');

const NK = require(path.join(ROOT, 'tests', 'load.js'))(['values.js', 'phrasebook.js', 'localize.js', 'localbook.js', 'numerals.js', 'clipvoice.js']);
const PB = NK.phrasebook;
const VOICES = NK.clipvoice.VOICES;
const LOCALS = Object.keys(VOICES).filter((l) => l !== 'pcm');

const file = (lang) => path.join(DIR, lang + '.json');
const slots = (src) => src.split('{}').length - 1;

/*
 * Money is counted in French across Cameroon, so an amount a model invents arrives as a
 * French or English number word, not as digits: "Frais bé cinq mille" passes a digit check
 * and shows an amount nobody sent. These are the words that carry a quantity. Bare "un",
 * "une" and "one" are left out, because French "un" is also an article and would fire on
 * ordinary loanword phrases; a fabricated amount needs a scale word or a second digit anyway.
 */
const MONEY_WORDS = new RegExp('\\b(' + [
  'z[eé]ro', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt', 'trente', 'quarante',
  'cinquante', 'soixante', 'cent', 'cents', 'mille', 'million', 'millions', 'milliard', 'milliards',
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'billion',
].join('|') + ')\\b', 'gi');

/**
 * Number words in a text, with accents folded. Folding matters because the French and
 * English versions of one line are translated once: an English source saying "zero" against
 * a translation spelling it "zéro" is the same word, not an invented number.
 */
function moneyWords(t) {
  const flat = String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return new Set(flat.match(MONEY_WORDS) || []);
}

/** Problems with one filled-in line, as messages. Empty means it is usable. */
function problems(src, out) {
  const errs = [];
  if (typeof out !== 'string' || !out.trim()) return errs; // not filled in yet: not an error
  const want = slots(src);
  const used = (out.match(/\{(\d+)\}/g) || []).map((m) => Number(m.slice(1, -1)));
  if (used.length !== want || new Set(used).size !== want || used.some((n) => n < 1 || n > want)) {
    errs.push(want
      ? `needs ${Array.from({ length: want }, (_, i) => `{${i + 1}}`).join(', ')} once each`
      : 'the source has no value, so the translation must have no {1}');
  }
  if (/\d/.test(out.replace(/\{\d+\}/g, ''))) errs.push('digits must come from the page, use {1}, {2}...');
  // a number spelled out is still a number, and is how an invented amount actually arrives
  const bare = out.replace(/\{\d+\}/g, '');
  const added = [...moneyWords(bare)].filter((w) => !moneyWords(src).has(w));
  if (added.length) {
    errs.push(`number word(s) not in the page text: ${added.join(', ')}. Amounts come from the page`);
  }
  return errs;
}

function read(lang) {
  const p = file(lang);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function write(lang, data) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file(lang), JSON.stringify(data, null, 2) + '\n');
}

function cmdStub(lang) {
  const existing = read(lang) || { language: lang, name: VOICES[lang].name, entries: [] };
  const bySrc = new Map((existing.entries || []).map((e) => [e.src, e]));
  const entries = [];
  const seen = new Set();
  for (const [src, pidgin] of PB.ENTRIES) {
    if (seen.has(src)) continue;
    seen.add(src);
    const old = bySrc.get(src);
    entries.push({
      src,
      pidgin,
      out: (old && old.out) || '',
      reviewed: !!(old && old.reviewed && old.out),
      by: (old && old.by) || '',
      ...(old && old.sure !== undefined ? { sure: old.sure } : {}),
      ...(old && old.note ? { note: old.note } : {}),
    });
  }
  const dropped = [...bySrc.keys()].filter((s) => !seen.has(s)).length;
  write(lang, { language: lang, name: VOICES[lang].name, entries });
  const filled = entries.filter((e) => e.out).length;
  const reviewed = entries.filter((e) => e.reviewed).length;
  console.log(`${VOICES[lang].name} (${lang}): ${entries.length} lines, ${filled} filled, ${reviewed} reviewed`
    + (dropped ? `, ${dropped} dropped (no longer on the page)` : ''));
}

function cmdCheck(lang) {
  const data = read(lang);
  if (!data) { console.log(`${lang}: no lexicon yet, run: build-lexicon.js stub ${lang}`); return 0; }
  let bad = 0;
  const entries = data.entries || [];
  entries.forEach((e, i) => {
    problems(e.src, e.out).forEach((m) => { bad++; console.log(`  line ${i + 1}: ${m}\n    src: ${e.src}\n    out: ${e.out}`); });
    if (e.reviewed && !e.out) { bad++; console.log(`  line ${i + 1}: marked reviewed but empty`); }
  });
  const filled = entries.filter((e) => e.out).length;
  const reviewed = entries.filter((e) => e.reviewed && e.out).length;
  const pct = entries.length ? Math.round((reviewed / entries.length) * 100) : 0;
  console.log(`${String(VOICES[lang].name).padEnd(10)} ${String(reviewed).padStart(4)}/${String(entries.length).padEnd(4)} reviewed ${String(pct).padStart(3)}%`
    + `  (${filled} filled, ${filled - reviewed} awaiting review)` + (bad ? `  ${bad} PROBLEM(S)` : ''));
  return bad;
}

/**
 * Fold in translations. The file may be {src: out} or a list of {src, out, by}.
 * A line already marked reviewed is never overwritten by an unreviewed value.
 */
function cmdMerge(lang, src) {
  const data = read(lang);
  if (!data) { console.error(`no lexicon for ${lang}; run stub first`); process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));

  // A model's answer comes back numbered (see the `prompt` command). It is always a draft:
  // nothing a model wrote is ever marked reviewed, whatever the file says.
  if (Array.isArray(raw) && raw.some((r) => r && typeof r.i === 'number')) {
    const twin = recycled(lang, raw);
    if (twin && !process.argv.includes('--force')) {
      console.error(`Refusing to merge: this looks like the ${twin.name} answer, not ${VOICES[lang].name}.`);
      console.error(`  ${twin.same} of ${twin.total} lines match ${twin.lang} once "${twin.a}" is read as "${twin.b}".`);
      console.error(`  Related languages share words, but a whole answer matching another one means the`);
      console.error(`  model reused what it had just written. Ask it again in a fresh session, with no`);
      console.error(`  other language in the conversation.`);
      console.error(`  Pass --force if the two really do share this much.`);
      process.exit(1);
    }

    let added = 0, skipped = 0, refused = 0, blank = 0, flagged = 0, oor = 0;
    for (const r of raw) {
      if (!r || typeof r.i !== 'number') continue;
      const e = data.entries[r.i - 1];
      if (!e) { oor++; continue; }
      const out = typeof r.out === 'string' ? r.out.trim() : '';
      if (!out) { blank++; continue; }
      if (e.reviewed) { skipped++; continue; }
      const errs = problems(e.src, out);
      if (errs.length) { refused++; console.log(`  refused line ${r.i}: ${errs.join('; ')}\n    src: ${e.src}\n    out: ${out}`); continue; }
      e.out = out;
      e.reviewed = false;
      e.by = '';
      e.sure = r.sure !== false;
      if (r.note) e.note = String(r.note);
      if (r.sure === false) flagged++;
      added++;
    }
    write(lang, data);
    console.log(`${VOICES[lang].name}: ${added} drafts merged, ${skipped} kept (already reviewed), `
      + `${refused} refused, ${blank} left blank by the model`
      + (oor ? `, ${oor} line number(s) out of range` : ''));
    console.log(`  ${flagged} marked unsure by the model: review those first.`);
    console.log(`  Nothing is marked reviewed. A native speaker sets reviewed:true per line.`);
    return;
  }

  const incoming = new Map();
  if (Array.isArray(raw)) raw.forEach((r) => r && r.src && incoming.set(r.src, r));
  else Object.entries(raw).forEach(([k, v]) => incoming.set(k, typeof v === 'string' ? { src: k, out: v } : { src: k, ...v }));

  let added = 0, skipped = 0, refused = 0, unknown = 0;
  // match on shape as well as on the exact string: drafts exported from the browser come
  // from real page text, which can carry a value where the canonical source has none
  const shape = (t) => NK.localbook.shapeOfSource(t);
  const byShape = new Map();
  for (const [k, v] of incoming) { try { byShape.set(shape(k), v); } catch (err) { /* skip */ } }
  const matched = new Set();
  for (const e of data.entries) {
    const inc = incoming.get(e.src) || byShape.get(shape(e.src));
    if (inc) matched.add(inc);
    if (!inc || !inc.out) continue;
    if (e.reviewed && !inc.reviewed) { skipped++; continue; }
    const errs = problems(e.src, inc.out);
    if (errs.length) { refused++; console.log(`  refused: ${e.src}\n    ${errs.join('; ')}`); continue; }
    e.out = inc.out;
    e.reviewed = !!inc.reviewed;
    e.by = inc.by || e.by || '';
    added++;
  }
  for (const v of incoming.values()) if (!matched.has(v)) unknown++;
  write(lang, data);
  console.log(`${VOICES[lang].name}: ${added} merged, ${skipped} kept (already reviewed), ${refused} refused`
    + (unknown ? `, ${unknown} not on the page and ignored` : ''));
}

/**
 * Is this answer just another language's answer with a word swapped?
 * Models asked for several related languages in one conversation will hand back what they
 * wrote last time, changed only where a word differs. Related languages do share vocabulary,
 * so this only reports a whole answer matching, not individual lines.
 */
function recycled(lang, raw) {
  const answers = raw.filter((r) => r && typeof r.i === 'number' && typeof r.out === 'string' && r.out.trim());
  if (answers.length < 20) return null;
  let worst = null;
  for (const other of LOCALS) {
    if (other === lang) continue;
    const data = read(other);
    if (!data) continue;
    const filled = data.entries.filter((e) => e.out).length;
    if (filled < answers.length / 2) continue;
    // the one word that differs most often between the two answers, if any
    const tally = new Map();
    let same = 0;
    for (const r of answers) {
      const mine = r.out.trim();
      const theirs = (data.entries[r.i - 1] || {}).out || '';
      if (!theirs) continue;
      if (mine === theirs) { same++; continue; }
      const a = mine.split(/\s+/), b = theirs.split(/\s+/);
      if (a.length !== b.length) continue;
      const diff = a.map((w, k) => [w, b[k]]).filter(([x, y]) => x !== y);
      const pairs = new Set(diff.map(([x, y]) => x.toLowerCase() + '\u0000' + y.toLowerCase()));
      if (pairs.size === 1) {
        const key = [...pairs][0];
        tally.set(key, (tally.get(key) || 0) + 1);
      }
    }
    const best = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];
    const matched = same + (best ? best[1] : 0);
    if (matched / answers.length >= 0.9) {
      const [a, b] = best ? best[0].split('\u0000') : ['', ''];
      const hit = { lang: other, name: data.name || other, same: matched, total: answers.length, a, b };
      if (!worst || hit.same > worst.same) worst = hit;
    }
  }
  return worst;
}

/* ---------- Prompts for drafting a language with Gemini ---------- */

/** Language detail from localize.js, without importing it as a module. */
function langInfo(lang) {
  const L = NK.localize && NK.localize.LANGUAGES && NK.localize.LANGUAGES[lang];
  return L || { name: VOICES[lang].name, full: VOICES[lang].name, where: 'Cameroon' };
}

/**
 * Write a paste-ready prompt. The whole file is the prompt: select all, paste into Gemini.
 * Lines are numbered and the model answers by number, so it never has to echo a source
 * string back and cannot quietly "correct" an accent or drop a value slot.
 */
function cmdPrompt(lang, chunk) {
  const data = read(lang);
  if (!data) { console.error(`no lexicon for ${lang}; run stub first`); process.exit(2); }
  const L = langInfo(lang);
  const dir = path.join(DIR, 'prompts');
  fs.mkdirSync(dir, { recursive: true });
  const entries = data.entries;
  const size = chunk || entries.length;
  const files = [];

  for (let start = 0; start < entries.length; start += size) {
    const slice = entries.slice(start, start + size);
    const part = Math.floor(start / size) + 1;
    const parts = Math.ceil(entries.length / size);
    let md = `You are helping translate the interface of a Cameroonian online bank into ${L.full}, as spoken in ${L.where}.\n\n`;
    md += `People will use this to move real money. A wrong line here can make someone send money to the wrong person, or miss a security warning. Accuracy matters more than style, and an honest "I am not sure" is better than a guess.\n\n`;
    md += `Your answer will be checked line by line by native speakers before it is used anywhere, so do not try to polish it. Mark your own uncertainty.\n\n`;
    md += `## Rules\n\n`;
    md += `1. \`{}\` in a source line marks a value the bank fills in: an amount, a name, a phone number, a date or a reference. In your translation write \`{1}\` for the first one, \`{2}\` for the second, and so on, in the order they appear in the source. Use each exactly once. A line whose slots do not match is thrown away.\n`;
    md += `2. Never write a number, in digits or in words. Every number is already inside \`{}\`. If you write a digit anywhere outside a slot, the line is thrown away.\n`;
    md += `3. Keep the exact meaning. Never add or drop information. Keep the financial words exact: send, confirm, cancel, validate, fee, balance, total.\n`;
    md += `4. Never soften a warning or a security message. "never", "do not" and "always" must stay just as strong.\n`;
    md += `5. Write in the standard orthography of the language (General Alphabet of Cameroon Languages), with its special letters and tone marks where they are normally written.\n`;
    md += `6. If there is no established word for a banking term (account, transfer, PIN, Mobile Money, balance), keep the French or English word the way speakers really say it. Do not invent a word. Code-switching is normal and is preferred over invention.\n`;
    md += `7. Keep brand names unchanged: Safinum, Safinum Pay, MTN MoMo, Orange Money, NkapTalk.\n`;
    md += `8. Keep each line short, close to the length of the source. These are buttons, labels and short messages.\n`;
    md += `9. Money is counted in French across Cameroon, and the app reads amounts aloud in French, so do not translate currency words into ${L.name}.\n\n`;
    md += `## What each line gives you\n\n`;
    md += `\`src\` is the bank's own text, in French or English. \`pidgin\` is a reviewed Cameroonian Pidgin version of the same line, there to settle what it means. Translate the meaning, from either one.\n\n`;
    md += `## Answer format\n\n`;
    md += `Reply with a JSON array and nothing else. One object per line, answering by number:\n\n`;
    md += '```json\n';
    md += '[\n  { "i": 1, "out": "<your translation>", "sure": true },\n';
    md += '  { "i": 2, "out": "<your translation>", "sure": false, "note": "no settled word for \'transfer\'" }\n]\n';
    md += '```\n\n';
    md += `Set \`sure\` to false whenever you are guessing, and say why in \`note\`. Leave \`out\` as an empty string for any line you cannot translate responsibly; that is a useful answer, not a failure. Answer every number from ${start + 1} to ${start + slice.length}, in order.\n\n`;
    if (parts > 1) md += `This is part ${part} of ${parts}. Answer only the lines below.\n\n`;
    md += `## Lines to translate\n\n`;
    md += '```json\n';
    md += JSON.stringify(slice.map((e, i) => ({ i: start + i + 1, src: e.src, pidgin: e.pidgin })), null, 2);
    md += '\n```\n';
    const name = parts > 1 ? `${lang}-${part}.md` : `${lang}.md`;
    fs.writeFileSync(path.join(dir, name), md);
    files.push(name);
  }
  console.log(`${L.name} (${lang}): lexicon/prompts/${files.join(', ')}  (${entries.length} lines)`);
}

module.exports = { problems, slots, recycled };

if (require.main !== module) return;

const cmd = process.argv[2];
const args = process.argv.slice(3);
const all = args.includes('--all');
const targets = all ? LOCALS : args.filter((a) => !a.startsWith('--') && VOICES[a]);
if (cmd === 'merge') {
  const lang = args[0];
  const src = args[1];
  if (!VOICES[lang] || !src) { console.error('usage: build-lexicon.js merge <lang> <file.json>'); process.exit(2); }
  cmdMerge(lang, src);
} else if (cmd === 'prompt') {
  const list = targets.length ? targets : LOCALS;
  const ci = process.argv.indexOf('--chunk');
  const chunk = ci > 0 ? Number(process.argv[ci + 1]) : 0;
  list.forEach((l) => cmdPrompt(l, chunk));
} else if (cmd === 'stub' || cmd === 'check') {
  const list = targets.length ? targets : LOCALS;
  let bad = 0;
  list.forEach((l) => { bad += (cmd === 'stub' ? (cmdStub(l), 0) : cmdCheck(l)); });
  process.exit(bad ? 1 : 0);
} else {
  console.error('usage: build-lexicon.js stub|check|prompt <lang|--all> [--chunk N]  |  merge <lang> <file.json>');
  process.exit(2);
}
