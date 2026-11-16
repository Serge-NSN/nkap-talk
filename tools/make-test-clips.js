#!/usr/bin/env node
/*
 * NkapTalk — throwaway tone clips, to test the recorded-voice plumbing before anyone records.
 *
 *   node tools/make-test-clips.js pcm        write tones for that language's Tier 1
 *   node tools/make-test-clips.js pcm --rm   delete them again
 *
 * These are BEEPS, not speech. They exist to prove that clips are found, fetched, decoded and
 * played back to back in the right order, which is the part that cannot be checked without a
 * browser. Each word gets its own pitch, so an amount comes out as a recognisable little tune
 * and a wrong order is audible. Delete them before putting real recordings in the folder.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'nkaptalk-extension');
const NK = require(path.join(ROOT, 'tests', 'load.js'))(['values.js', 'phrasebook.js', 'numerals.js', 'clipvoice.js', 'speech.js']);
const CV = NK.clipvoice;

const RATE = 16000;
const MARKER = '.tones-not-speech';

function wav(seconds, freq) {
  const n = Math.floor(RATE * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const fade = Math.min(1, t / 0.01, (seconds - t) / 0.01); // no clicks at the edges
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * freq * t) * 0.3 * fade * 32767), 44 + i * 2);
  }
  return buf;
}

const lang = process.argv[2] || 'pcm';
if (!CV.VOICES[lang]) { console.error(`unknown language "${lang}"`); process.exit(2); }
const dir = path.join(EXT, 'audio', lang);
const remove = process.argv.includes('--rm');

if (remove) {
  if (!fs.existsSync(path.join(dir, MARKER))) {
    console.error(`${dir} holds no tone clips (no ${MARKER}); refusing to delete anything.`);
    process.exit(1);
  }
  let n = 0;
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.wav')) { fs.unlinkSync(path.join(dir, f)); n++; }
  fs.unlinkSync(path.join(dir, MARKER));
  console.log(`removed ${n} tone clips from audio/${lang}/`);
  process.exit(0);
}

fs.mkdirSync(dir, { recursive: true });
const existing = fs.readdirSync(dir).filter((f) => /\.(webm|ogg|mp3|m4a|flac)$/.test(f));
if (existing.length) {
  console.error(`audio/${lang}/ already holds ${existing.length} real recording(s). Refusing to add tones.`);
  process.exit(1);
}

// Cover every tier, not only the numbers. A sentence plays from clips only when every one
// of its words is recorded, so Tier 1 on its own would never produce a single audible clip:
// each reply has prose around the amount. Covering all tiers makes whole replies play.
const wantedPath = path.join(dir, 'wanted.json');
const words = fs.existsSync(wantedPath)
  ? JSON.parse(fs.readFileSync(wantedPath, 'utf8')).map((w) => w.text)
  : CV.numberVocabulary(lang);
let i = 0;
for (const w of words) {
  // short beep for a single word, longer for a whole phrase, so the shape of a reply is audible
  const n = String(w).trim().split(/\s+/).length;
  const freq = 220 * Math.pow(2, (i % 24) / 12);
  fs.writeFileSync(path.join(dir, CV.slug(w) + '.wav'), wav(Math.min(1.2, 0.22 + 0.12 * (n - 1)), freq));
  i++;
}
fs.writeFileSync(path.join(dir, MARKER), 'Tone clips written by tools/make-test-clips.js. Not speech. Delete before recording.\n');
console.log(`wrote ${i} tone clips to audio/${lang}/ (${CV.VOICES[lang].name} Tier 1)`);
console.log(`now run: node tools/build-clips.js index ${lang}`);
console.log(`to undo: node tools/make-test-clips.js ${lang} --rm`);
