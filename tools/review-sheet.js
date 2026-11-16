#!/usr/bin/env node
/*
 * NkapTalk — the shortlist to put in front of a native speaker first.
 *
 *   node tools/review-sheet.js ewo [--lines 20]
 *
 * All 268 lines per language need checking eventually. This picks the ones where being wrong
 * costs the most, so an hour of a speaker's time buys the most safety: the warnings about a
 * PIN, the read-back before money moves, the amounts, and the handful of screens a demo and a
 * first real user actually walk through. It writes a sheet a speaker can fill in on paper or
 * on a phone, and the corrections go back in with the normal merge.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'nkaptalk-extension');
const NK = require(path.join(ROOT, 'tests', 'load.js'))(['values.js', 'phrasebook.js', 'localize.js', 'numerals.js', 'clipvoice.js']);
const VOICES = NK.clipvoice.VOICES;

// what makes a line worth checking first, highest first
const RANK = [
  [100, /\b(pin|otp|code secret|mot de passe|password|jamais|never|ne communiquez|do not share)\b/i, 'never share a secret'],
  [90, /\b(s[ée]curit[ée]|security|alerte|alert|attention|warning|v[ée]rifiez|verify|avant de confirmer|before you confirm)\b/i, 'security warning'],
  [80, /\b(confirm|confirmer|valider|annuler|cancel)\b/i, 'confirming or cancelling money'],
  [70, /\b(solde|balance|montant|amount|total|frais|fee|charge)\b/i, 'an amount on screen'],
  [60, /\b(b[ée]n[ée]ficiaire|beneficiary|destinataire|t[ée]l[ée]phone|phone|num[ée]ro|number|nom|name)\b/i, 'who the money goes to'],
  [50, /\b(transfert|transfer|envoyer|send|compte|account)\b/i, 'the transfer itself'],
  [40, /\b(erreur|error|[ée]chec|insuffisant|insufficient|refus)\b/i, 'something went wrong'],
];

function rank(text) {
  for (const [score, re, why] of RANK) if (re.test(text)) return { score, why };
  return { score: 0, why: '' };
}

const lang = process.argv[2];
if (!lang || !VOICES[lang] || lang === 'pcm') {
  console.error('usage: review-sheet.js <lang> [--lines N]   e.g. review-sheet.js ewo');
  process.exit(2);
}
const li = process.argv.indexOf('--lines');
const LIMIT = li > 0 ? Number(process.argv[li + 1]) : 20;

const page = JSON.parse(fs.readFileSync(path.join(EXT, 'lexicon', lang + '.json'), 'utf8'));
const replies = JSON.parse(fs.readFileSync(path.join(EXT, 'lexicon', 'replies', lang + '.json'), 'utf8'));

const rows = [];
page.entries.forEach((e, i) => {
  const r = rank(e.src + ' ' + e.pidgin);
  // an unsure draft matters more than a confident one
  rows.push({ set: 'page', n: i + 1, src: e.src, pidgin: e.pidgin, out: e.out, reviewed: e.reviewed,
    score: r.score + (e.sure === false ? 8 : 0), why: r.why, note: e.note || '' });
});
replies.entries.forEach((e, i) => {
  const r = rank(e.pidgin);
  rows.push({ set: 'reply', n: i + 1, src: '', pidgin: e.pidgin, out: e.out, reviewed: e.reviewed,
    score: r.score + (e.sure === false ? 8 : 0) + 5, why: r.why, note: e.note || '' });
});

const seen = new Set();
// Take turns between the kinds of line rather than filling the sheet with the top-scoring
// kind. Twenty warnings about a PIN check one thing twenty times; a sheet that walks the
// whole journey, balance to confirmation, finds more.
// Only lines that have something to look at. A line with no draft shows nothing on screen
// anyway, so asking a speaker to invent one is a worse use of their hour than checking the
// lines people will actually read.
const eligible = rows
  .filter((x) => !x.reviewed && x.score > 0 && x.out)
  .filter((x) => { const k = x.set + '|' + (x.out || x.pidgin); if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => b.score - a.score);
const buckets = new Map();
for (const x of eligible) {
  if (!buckets.has(x.why)) buckets.set(x.why, []);
  buckets.get(x.why).push(x);
}
const order = RANK.map(([, , why]) => why).filter((w) => buckets.has(w));
const pick = [];
for (let round = 0; pick.length < LIMIT; round++) {
  let added = false;
  for (const why of order) {
    const b = buckets.get(why);
    if (b[round]) { pick.push(b[round]); added = true; if (pick.length >= LIMIT) break; }
  }
  if (!added) break;
}

const name = VOICES[lang].name;
let md = `# ${name} — the lines to check first\n\n`;
md += `${pick.length} lines out of ${page.entries.length + replies.entries.length}. These are the ones where being wrong costs the most: what the app says about a PIN, what it reads back before money moves, and the amounts.\n\n`;
md += `For each line: if the ${name} is right, tick it. If not, write what it should be. If you are not sure, say so and leave it — an honest blank is better than a guess, and the app falls back to Pidgin for anything unchecked.\n\n`;
md += `**Do not write any number.** Amounts come from the bank's screen. Where you see \`{1}\` or \`{2}\`, leave it exactly as it is: that is where the amount goes.\n\n`;
md += `Reviewer: ________________  Date: __________\n\n---\n\n`;
pick.forEach((x, i) => {
  md += `### ${i + 1}. ${x.why}\n\n`;
  if (x.src) md += `**The bank says:** ${x.src}\n\n`;
  md += `**In Pidgin:** ${x.pidgin}\n\n`;
  md += `**Proposed ${name}:** ${x.out || '_(nothing yet)_'}\n\n`;
  if (x.note) md += `*Worth a close look: ${x.note}*\n\n`;
  md += `correct? ☐ yes  ☐ no  ☐ not sure\n\n`;
  md += `if no, it should be: ________________________________________\n\n`;
  md += `<small>${x.set} line ${x.n}</small>\n\n---\n\n`;
});
const noDraft = rows.filter((x) => !x.out).length;
if (noDraft) {
  md += `_${noDraft} of the ${rows.length} lines have no proposed ${name} yet and are left out of this sheet._\n\n`;
}
const out = path.join(EXT, 'lexicon', 'review-' + lang + '.md');
fs.writeFileSync(out, md);
console.log(`${name}: wrote lexicon/review-${lang}.md  (${pick.length} lines)`);
const byWhy = {};
pick.forEach((x) => { byWhy[x.why] = (byWhy[x.why] || 0) + 1; });
Object.entries(byWhy).sort((a, b) => b[1] - a[1]).forEach(([w, n]) => console.log(`  ${String(n).padStart(2)}  ${w}`));
