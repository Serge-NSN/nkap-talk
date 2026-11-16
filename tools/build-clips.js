#!/usr/bin/env node
/*
 * NkapTalk — recorded Pidgin voice: build the recording script, and index what is recorded.
 *
 *   node tools/build-clips.js script   -> audio/pcm/SCRIPT.md + audio/pcm/wanted.json
 *   node tools/build-clips.js index    -> audio/pcm/index.json + coverage report
 *
 * The script is DERIVED from assistant.js and phrasebook.js, so it cannot drift from the
 * sentences NkapTalk actually says. Values are never in it: amounts come from the closed
 * number vocabulary, which is why ~63 clips cover every amount the bank can show.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'nkaptalk-extension');
const audioDir = (lang) => path.join(EXT, 'audio', lang);
const FORMATS = ['webm', 'ogg', 'mp3', 'm4a', 'wav', 'flac'];

const NK = require(path.join(ROOT, 'tests', 'load.js'))(['values.js', 'phrasebook.js', 'numerals.js', 'clipvoice.js', 'speech.js']);
const CV = NK.clipvoice;
const NUM = NK.numerals;

// ---------- Pull every literal string out of a JS file, templates included ----------
/** Replaces ${...} with \x00 and returns the static text of each literal. */
function literals(src) {
  const out = [];
  let i = 0;
  const n = src.length;

  function template(j) { // j points just past the opening backtick
    let text = '';
    while (j < n) {
      const c = src[j];
      if (c === '\\') { text += src[j + 1] || ''; j += 2; continue; }
      if (c === '`') return { text, next: j + 1 };
      if (c === '$' && src[j + 1] === '{') { j = expr(j + 2); text += '\x00'; continue; }
      text += c; j++;
    }
    return { text, next: j };
  }
  function expr(j) { // inside ${ ... }: skip to the matching }
    let depth = 1;
    while (j < n && depth > 0) {
      const c = src[j];
      if (c === '`') { const t = template(j + 1); out.push(t.text); j = t.next; continue; }
      if (c === "'" || c === '"') { j = quoted(j + 1, c); continue; }
      if (c === '{') depth++;
      if (c === '}') depth--;
      j++;
    }
    return j;
  }
  function quoted(j, q) {
    let text = '';
    while (j < n) {
      const c = src[j];
      if (c === '\\') { text += src[j + 1] || ''; j += 2; continue; }
      if (c === q) { out.push(text); return j + 1; }
      text += c; j++;
    }
    return j;
  }

  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; continue; }
    if (c === '`') { const t = template(i + 1); out.push(t.text); i = t.next; continue; }
    if (c === "'" || c === '"') { i = quoted(i + 1, c); continue; }
    i++;
  }
  return out;
}

/** A literal -> the sentence-sized static runs that a clip can cover. */
function runs(lit) {
  const parts = [];
  // a value marker ends a run; so does a sentence ender, because clips never span one
  for (const sentence of lit.split(/(?<=[.!?])\s+/)) {
    for (const run of sentence.split('\x00')) {
      const t = CV.norm(run);
      if (t) parts.push(t);
    }
  }
  return parts;
}

const looksLikeProse = (t) => /^[a-z0-9 '-]+$/.test(t) && t.split(' ').length >= 2 && t.length >= 6;

function wanted(lang) {
  const voice = CV.VOICES[lang];
  const num = NUM.get(voice.numerals);
  const tiers = [];

  const numeralNote = voice.numerals === 'fr'
    ? 'Amounts are read in French, the way money is counted across Cameroon. Say these French words, '
      + 'in your own accent. This also keeps tone out of amounts: French has no tone, so an amount spliced '
      + 'into one of your sentences can never come out as a different word.'
    : 'Read each word alone, flat and even, with a clear gap before and after. They get joined together.';

  tiers.push({
    id: 'numbers',
    title: `Tier 1 — numbers and letters (${voice.numerals === 'fr' ? 'French' : 'Pidgin'}; every amount depends on these)`,
    note: numeralNote + ' Once these exist, every amount, fee, total, percentage, phone number and reference '
      + 'is spoken by a real voice.',
    items: [...num.vocabulary(), ...CV.LETTERS],
    say: 'word',
  });

  const fromFile = (file) => {
    const src = fs.readFileSync(path.join(EXT, 'content', file), 'utf8');
    const set = new Set();
    for (const lit of literals(src)) for (const r of runs(lit)) if (looksLikeProse(r)) set.add(r);
    return set;
  };

  const inLang = lang === 'pcm'
    ? 'Read these as normal speech.'
    : `Each line is written in Pidgin. Say what it means in ${voice.name}, in your own words, as you would say it to a customer.`;
  const toneNote = voice.tonal
    ? ` ${voice.name} is tonal, so say each line as ONE natural utterance and keep it whole. `
      + 'Never say it word by word: NkapTalk plays your recording whole and never cuts into it, which is what '
      + 'keeps the tones right.'
    : '';
  const openNote = ' Where a line ends without finishing the thought, an amount follows, so let your voice stay '
    + 'open, as if you are about to say a number.';

  const assistant = fromFile('assistant.js');
  tiers.push({
    id: 'replies',
    title: "Tier 2 — NkapTalk's own sentences",
    note: inLang + toneNote + openNote,
    items: [...assistant].sort(),
    say: 'line',
  });

  const PB = require(path.join(ROOT, 'tests', 'load.js'))(['values.js', 'phrasebook.js']).phrasebook;
  const phrase = new Set();
  for (const [, out] of PB.ENTRIES) {
    const t = CV.norm(String(out).replace(/\{\d*\}/g, '\x00'));
    for (const r of runs(t)) if (looksLikeProse(r)) phrase.add(r);
  }
  for (const a of assistant) phrase.delete(a);
  tiers.push({
    id: 'page',
    title: 'Tier 3 — page text read aloud',
    note: inLang + toneNote + ' Record as far down as time allows: anything missing is spoken in Pidgin instead, '
      + 'so a part-finished tier still works.',
    items: [...phrase].sort(),
    say: 'line',
  });

  return tiers;
}

function cmdScript(lang) {
  const voice = CV.VOICES[lang];
  const AUDIO = audioDir(lang);
  const tiers = wanted(lang);
  const all = [];
  let md = `# Recording script — NkapTalk ${voice.name} voice\n\n`;
  md += 'Generated by `node tools/build-clips.js script ' + lang + '`. Do not edit by hand.\n\n';
  if (lang !== 'pcm') {
    md += `NkapTalk writes its replies in Pidgin and plays your ${voice.name} recording in their place, so the\n`;
    md += 'lines below are the Pidgin ones. Say each in ' + voice.name + '. Nothing you record is translated by a\n';
    md += 'machine afterwards, and no number you say is reused anywhere else.\n\n';
  }
  md += '**How to record.** One file per line below, named with the id in `code`. Any of ';
  md += FORMATS.map((f) => '`.' + f + '`').join(', ') + ' works. Put them all in `nkaptalk-extension/audio/' + lang + '/`, ';
  md += 'then run `node tools/build-clips.js index ' + lang + '`.\n\n';
  md += '**Voice.** One speaker throughout, same room, same distance, no music. Trim the silence at both ends ';
  md += 'to about 50 ms: the clips are played back to back, so long silences make NkapTalk sound slow.\n\n';
  md += 'Do not read out any number that is not in Tier 1. Amounts always come from the page.\n\n';
  if (voice.tonal) {
    md += `**${voice.name} is a tonal language.** Tone shifts with the words around it, so a sentence cut into\n`;
    md += 'words and glued back together can say something nobody said. NkapTalk therefore plays each Tier 2 and\n';
    md += 'Tier 3 line as one whole recording and never cuts into it. Say each of those lines in one go.\n\n';
  }
  for (const t of tiers) {
    md += `## ${t.title}\n\n${t.note}\n\n`;
    md += `${t.items.length} clips.\n\n| # | ${t.say === 'word' ? 'say this word' : (lang === 'pcm' ? 'say this' : 'say this, in ' + voice.name)} | file id |\n|---|---|---|\n`;
    t.items.forEach((text, i) => {
      const id = CV.slug(text);
      all.push({ tier: t.id, text, id });
      md += `| ${i + 1} | ${text} | \`${id}\` |\n`;
    });
    md += '\n';
  }
  fs.mkdirSync(AUDIO, { recursive: true });
  fs.writeFileSync(path.join(AUDIO, 'SCRIPT.md'), md);
  fs.writeFileSync(path.join(AUDIO, 'wanted.json'), JSON.stringify(all, null, 2) + '\n');
  console.log(`${voice.name} (${lang}): wrote audio/${lang}/SCRIPT.md and wanted.json`);
  for (const t of tiers) console.log(`  ${t.id.padEnd(9)} ${String(t.items.length).padStart(4)} clips`);
  console.log(`  ${'TOTAL'.padEnd(9)} ${String(all.length).padStart(4)} clips`);
}

function cmdIndex(lang) {
  const voice = CV.VOICES[lang];
  const AUDIO = audioDir(lang);
  fs.mkdirSync(AUDIO, { recursive: true });
  const wantedPath = path.join(AUDIO, 'wanted.json');
  const list = fs.existsSync(wantedPath) ? JSON.parse(fs.readFileSync(wantedPath, 'utf8')) : [];
  const index = {};
  for (const f of fs.readdirSync(AUDIO)) {
    const ext = path.extname(f).slice(1).toLowerCase();
    if (!FORMATS.includes(ext)) continue;
    const id = path.basename(f, path.extname(f));
    if (!index[id]) index[id] = f;
  }
  fs.writeFileSync(path.join(AUDIO, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  const byTier = {};
  for (const w of list) {
    byTier[w.tier] = byTier[w.tier] || { have: 0, total: 0, missing: [] };
    byTier[w.tier].total++;
    if (index[w.id]) byTier[w.tier].have++;
    else byTier[w.tier].missing.push(w.text);
  }
  console.log(`${voice.name} (${lang}): ${Object.keys(index).length} clips indexed\n`);
  for (const [tier, st] of Object.entries(byTier)) {
    const pct = st.total ? Math.round((st.have / st.total) * 100) : 0;
    console.log(`  ${tier.padEnd(9)} ${String(st.have).padStart(4)}/${String(st.total).padEnd(4)} ${String(pct).padStart(3)}%`);
  }
  const t1 = byTier.numbers;
  if (t1 && t1.have < t1.total) {
    console.log(`\n  Tier 1 is not finished, so amounts fall back to the Pidgin voice.`);
    console.log(`  Missing ${t1.missing.length}: ${t1.missing.slice(0, 20).join(', ')}${t1.missing.length > 20 ? ' ...' : ''}`);
  } else if (t1) {
    console.log(`\n  Tier 1 complete: every amount is spoken by the recorded ${voice.name} voice.`);
  }
}

const cmd = process.argv[2];
const langs = process.argv.slice(3).filter((a) => a !== '--all');
const all = process.argv.includes('--all');
const targets = all ? Object.keys(CV.VOICES) : (langs.length ? langs : ['pcm']);
for (const l of targets) {
  if (!CV.VOICES[l]) { console.error(`unknown language "${l}". Known: ${Object.keys(CV.VOICES).join(', ')}`); process.exit(2); }
}
if (cmd === 'script') targets.forEach((l) => { cmdScript(l); console.log(); });
else if (cmd === 'index') targets.forEach((l) => { cmdIndex(l); console.log(); });
else { console.error('usage: build-clips.js script|index [lang...|--all]'); process.exit(2); }
