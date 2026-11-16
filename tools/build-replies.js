#!/usr/bin/env node
/*
 * NkapTalk — what NkapTalk itself says, in each language.
 *
 *   node tools/build-replies.js stub   <lang|--all>
 *   node tools/build-replies.js prompt <lang|--all> [--chunk N]
 *   node tools/build-replies.js merge  <lang> <file.json>
 *   node tools/build-replies.js check  <lang|--all>
 *
 * The page lexicon covers the bank's own text. This covers the assistant's sentences, which
 * are written in Pidgin in assistant.js and never passed through any translation, so choosing
 * Ewondo used to leave NkapTalk answering in Pidgin.
 *
 * The entries are the pieces of a reply BETWEEN its values, because a reply is assembled at
 * runtime with amounts and names dropped into it. They are keyed by the Pidgin piece with
 * punctuation and case removed, which is the same key the recordings use, so one translation
 * round gives both the text on screen and the script a speaker reads.
 *
 * Nothing here is generated. `out` starts empty, only a line a speaker has marked reviewed is
 * shown, and a reply falls back to Pidgin whole rather than appearing half translated.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'nkaptalk-extension');
const DIR = path.join(EXT, 'lexicon', 'replies');
const LEX = require(path.join(ROOT, 'tools', 'build-lexicon.js')); // problems(), slots()
const NK = require(path.join(ROOT, 'tests', 'load.js'))(['values.js', 'phrasebook.js', 'localize.js', 'numerals.js', 'clipvoice.js']);
const CV = NK.clipvoice;
const LANGS = NK.localize.LANGUAGES;
const LOCALS = Object.keys(CV.VOICES).filter((l) => l !== 'pcm');

const file = (lang) => path.join(DIR, lang + '.json');
const read = (lang) => (fs.existsSync(file(lang)) ? JSON.parse(fs.readFileSync(file(lang), 'utf8')) : null);
const write = (lang, d) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(lang), JSON.stringify(d, null, 2) + '\n'); };

/** The assistant's own sentence pieces, taken from the recording script so the two agree. */
function fragments() {
  const w = path.join(EXT, 'audio', 'pcm', 'wanted.json');
  if (!fs.existsSync(w)) {
    console.error('run: node tools/build-clips.js script pcm   (the fragment list comes from it)');
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(w, 'utf8')).filter((x) => x.tier === 'replies').map((x) => x.text);
}

function cmdStub(lang) {
  const old = new Map(((read(lang) || {}).entries || []).map((e) => [e.pidgin, e]));
  const entries = fragments().map((p) => {
    const o = old.get(p);
    return {
      pidgin: p,
      out: (o && o.out) || '',
      reviewed: !!(o && o.reviewed && o.out),
      by: (o && o.by) || '',
      ...(o && o.sure !== undefined ? { sure: o.sure } : {}),
      ...(o && o.note ? { note: o.note } : {}),
    };
  });
  write(lang, { language: lang, name: CV.VOICES[lang].name, entries });
  console.log(`${CV.VOICES[lang].name} (${lang}): ${entries.length} sentences, ${entries.filter((e) => e.out).length} filled, ${entries.filter((e) => e.reviewed).length} reviewed`);
}

function cmdCheck(lang) {
  const d = read(lang);
  if (!d) { console.log(`${lang}: no file yet, run stub`); return 0; }
  let bad = 0;
  d.entries.forEach((e, i) => {
    LEX.problems(e.pidgin, e.out).forEach((m) => { bad++; console.log(`  line ${i + 1}: ${m}\n    pidgin: ${e.pidgin}\n    out:    ${e.out}`); });
    if (e.reviewed && !e.out) { bad++; console.log(`  line ${i + 1}: reviewed but empty`); }
  });
  const filled = d.entries.filter((e) => e.out).length;
  const rev = d.entries.filter((e) => e.reviewed && e.out).length;
  console.log(`${String(d.name).padEnd(10)} ${String(rev).padStart(3)}/${String(d.entries.length).padEnd(3)} reviewed  (${filled} filled)` + (bad ? `  ${bad} PROBLEM(S)` : ''));
  return bad;
}

function cmdMerge(lang, src) {
  const d = read(lang);
  if (!d) { console.error(`no file for ${lang}; run stub first`); process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
  let added = 0, kept = 0, refused = 0, blank = 0, flagged = 0, oor = 0;
  for (const r of raw) {
    if (!r || typeof r.i !== 'number') continue;
    const e = d.entries[r.i - 1];
    if (!e) { oor++; continue; }
    const out = typeof r.out === 'string' ? r.out.trim() : '';
    if (!out) { blank++; continue; }
    if (e.reviewed) { kept++; continue; }
    const errs = LEX.problems(e.pidgin, out);
    if (errs.length) { refused++; console.log(`  refused line ${r.i}: ${errs.join('; ')}\n    pidgin: ${e.pidgin}\n    out:    ${out}`); continue; }
    e.out = out; e.reviewed = false; e.by = '';
    e.sure = r.sure !== false;
    if (r.note) e.note = String(r.note);
    if (r.sure === false) flagged++;
    added++;
  }
  write(lang, d);
  console.log(`${CV.VOICES[lang].name}: ${added} drafts merged, ${kept} kept, ${refused} refused, ${blank} blank` + (oor ? `, ${oor} out of range` : ''));
  console.log(`  ${flagged} marked unsure. Nothing is reviewed; a speaker sets reviewed:true per line.`);
}

function cmdPrompt(lang, chunk) {
  const d = read(lang);
  if (!d) { console.error(`no file for ${lang}; run stub first`); process.exit(2); }
  const L = LANGS[lang] || { full: CV.VOICES[lang].name, where: 'Cameroon', name: CV.VOICES[lang].name };
  const dir = path.join(DIR, 'prompts');
  fs.mkdirSync(dir, { recursive: true });
  const all = d.entries;
  const size = chunk || all.length;
  const names = [];
  for (let start = 0; start < all.length; start += size) {
    const slice = all.slice(start, start + size);
    const part = Math.floor(start / size) + 1, parts = Math.ceil(all.length / size);
    let md = `You are translating what a banking assistant says out loud, from Cameroonian Pidgin into ${L.full}, as spoken in ${L.where}.\n\n`;
    md += `People use this to move real money, and these are the assistant's own words: the greeting, the questions it asks, what it reads back before a transfer, and its warnings. Accuracy matters more than style, and an honest "I am not sure" is better than a guess. Native speakers check every line before it is used.\n\n`;
    md += `## What these lines are\n\nEach line is a piece of a sentence. The assistant drops an amount, a name or a phone number in between the pieces as it speaks, so a line often stops in the middle of a thought. Translate the piece as it stands and leave it open; do not add a value, and do not try to finish the sentence.\n\n`;
    md += `## Rules\n\n`;
    md += `1. Never write a number, in digits or in words. Every amount comes from the bank's screen, never from you. A digit anywhere gets the line thrown away.\n`;
    md += `2. Keep the exact meaning. Keep the financial words exact: send, confirm, cancel, fee, balance, total.\n`;
    md += `3. Never soften a warning. "never", "do not" and "always" stay just as strong.\n`;
    md += `4. Write in the standard orthography of the language (General Alphabet of Cameroon Languages), with its tone marks where they are normally written.\n`;
    md += `5. Where there is no established word for a banking term, keep the French or English one as speakers really say it. Never invent a word.\n`;
    md += `6. Keep brand names: Safinum, Safinum Pay, MTN MoMo, Orange Money, NkapTalk.\n`;
    md += `7. Keep it short, close to the length of the Pidgin.\n`;
    md += `8. These will be read aloud by a person, so write what someone would actually say.\n\n`;
    md += `## Answer format\n\nReply with a JSON array and nothing else, answering by number:\n\n`;
    md += '```json\n[\n  { "i": 1, "out": "<your translation>", "sure": true },\n  { "i": 2, "out": "", "sure": false, "note": "no settled word for this" }\n]\n```\n\n';
    md += `Set \`sure\` to false when guessing and say why. Leave \`out\` empty rather than guess badly. Answer every number from ${start + 1} to ${start + slice.length}.\n\n`;
    if (parts > 1) md += `This is part ${part} of ${parts}.\n\n`;
    md += `## Lines\n\n\`\`\`json\n`;
    md += JSON.stringify(slice.map((e, i) => ({ i: start + i + 1, pidgin: e.pidgin })), null, 2);
    md += '\n```\n';
    const nm = parts > 1 ? `${lang}-${part}.md` : `${lang}.md`;
    fs.writeFileSync(path.join(dir, nm), md);
    names.push(nm);
  }
  console.log(`${L.name} (${lang}): lexicon/replies/prompts/${names.join(', ')}  (${all.length} lines)`);
}

/**
 * Some of the assistant's sentences are word for word a line of the bank's page, which the
 * page lexicon already has a translation for. Reuse those rather than asking for them twice.
 * They arrive as drafts like everything else: the same model wrote them, so they carry the
 * same doubt and still need a speaker.
 */
function cmdFromPage(lang) {
  const d = read(lang);
  if (!d) { console.error(`no file for ${lang}; run stub first`); process.exit(2); }
  const pageFile = path.join(EXT, 'lexicon', lang + '.json');
  if (!fs.existsSync(pageFile)) { console.error(`no page lexicon for ${lang}`); process.exit(2); }
  const norm = (x) => CV.norm(String(x).replace(/\{\d*\}/g, ' '));
  const byPidgin = new Map();
  for (const e of JSON.parse(fs.readFileSync(pageFile, 'utf8')).entries) {
    if (e.out) byPidgin.set(norm(e.pidgin), e);
  }
  let added = 0, kept = 0, refused = 0;
  for (const e of d.entries) {
    if (e.out) { kept++; continue; }
    const hit = byPidgin.get(norm(e.pidgin));
    if (!hit) continue;
    const errs = LEX.problems(e.pidgin, hit.out);
    if (errs.length) { refused++; continue; }
    e.out = hit.out;
    e.reviewed = false;
    e.by = '';
    e.sure = hit.sure !== false;
    e.note = (hit.note ? hit.note + ' ' : '') + '(taken from the same line on the bank page)';
    added++;
  }
  write(lang, d);
  console.log(`${CV.VOICES[lang].name}: ${added} taken from the page lexicon, ${kept} already had one`
    + (refused ? `, ${refused} refused` : '') + `, ${d.entries.filter((x) => !x.out).length} still to translate`);
}

const cmd = process.argv[2];
const args = process.argv.slice(3);
const targets = args.includes('--all') ? LOCALS : args.filter((a) => CV.VOICES[a]);
const list = targets.length ? targets : LOCALS;
if (cmd === 'merge') { if (!CV.VOICES[args[0]] || !args[1]) { console.error('usage: merge <lang> <file.json>'); process.exit(2); } cmdMerge(args[0], args[1]); }
else if (cmd === 'stub') list.forEach(cmdStub);
else if (cmd === 'from-page') list.forEach(cmdFromPage);
else if (cmd === 'check') { let b = 0; list.forEach((l) => { b += cmdCheck(l); }); process.exit(b ? 1 : 0); }
else if (cmd === 'prompt') { const ci = process.argv.indexOf('--chunk'); list.forEach((l) => cmdPrompt(l, ci > 0 ? Number(process.argv[ci + 1]) : 0)); }
else { console.error('usage: build-replies.js stub|check|prompt|from-page <lang|--all> | merge <lang> <file.json>'); process.exit(2); }
