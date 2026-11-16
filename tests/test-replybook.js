// What NkapTalk says, in the chosen language: swapping, the review gate, and the values.
const fs = require('fs');
const path = require('path');
const load = require('./load');

let reply = { ok: false };
const P = load(['values.js', 'phrasebook.js', 'numerals.js', 'clipvoice.js', 'replybook.js'],
  { fetch: async () => reply });
const RB = P.replybook;

let fails = 0, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };

// stand-ins for real translations; no actual Ewondo is invented in a test
const fixture = {
  language: 'ewo', name: 'Ewondo',
  entries: [
    { pidgin: 'moni wey dey your account na', out: 'EWO-BALANCE', reviewed: true, by: 'A. Speaker' },
    { pidgin: 'account number na', out: 'EWO-ACCT', reviewed: true, by: 'A. Speaker' },
    { pidgin: 'charge na', out: 'EWO-FEE-DRAFT', reviewed: false, by: '' },
    { pidgin: 'abeg talk again', out: 'EWO-AGAIN', reviewed: true, by: 'A. Speaker' },
    { pidgin: 'i no hear you well', out: '', reviewed: false, by: '' },
  ],
};

(async () => {
  reply = { ok: true, json: async () => fixture };
  const c = await RB.load('ewo');
  check(c.lines === 5, `5 lines, got ${c.lines}`);
  check(c.filled === 4, `4 filled, got ${c.filled}`);
  check(c.reviewed === 3, `3 reviewed, got ${c.reviewed}`);

  // 1. a reply with a value: the piece is swapped, the amount is untouched
  const r = RB.localize('Moni wey dey your account na 250 000 FCFA.');
  check(r !== null, 'reviewed reply localised');
  check(r && r.includes('EWO-BALANCE'), `piece swapped: ${r}`);
  check(r && r.includes('250 000 FCFA'), `amount kept exactly: ${r}`);
  check(r && !/moni wey dey/i.test(r), 'no Pidgin left behind');

  // 2. two values in one reply
  const two = RB.localize('Moni wey dey your account na 250 000 FCFA. Account number na CM 001 2345 6789 01.');
  check(two !== null, 'reply with two values localised');
  check(two && two.includes('250 000 FCFA') && two.includes('CM 001 2345 6789 01'), `both values kept: ${two}`);

  // 3. all or nothing: one untranslated piece drops the whole reply to Pidgin
  check(RB.localize('I no hear you well. Abeg talk again.') === null,
    'a reply with an empty piece is refused whole');

  // 4. the review gate
  check(RB.localize('Charge na 100 FCFA.') === null, 'unchecked piece withheld by default');
  const d = RB.localize('Charge na 100 FCFA.', true);
  check(d && d.includes('EWO-FEE-DRAFT') && d.includes('100 FCFA'), `draft shown when allowed: ${d}`);

  // 5. a piece nobody translated at all
  check(RB.localize('Something nobody ever wrote down.') === null, 'unknown reply -> null');

  // 6. Pidgin clears the table, so no local text leaks into Pidgin mode
  await RB.load('pcm');
  check(RB.localize('Moni wey dey your account na 250 000 FCFA.', true) === null, 'Pidgin mode has no reply book');
  check(RB.counts.lines === 0, 'counts reset for Pidgin');

  // 7. a missing file is survivable
  reply = { ok: false };
  await RB.load('dua');
  check(RB.localize('Moni wey dey your account na 250 000 FCFA.', true) === null, 'missing file survivable');

  // 8. every shipped reply book is valid and covers the assistant
  const dir = path.join(__dirname, '..', 'nkaptalk-extension', 'lexicon', 'replies');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  check(files.length === 8, `8 reply books shipped, found ${files.length}`);
  const TOOL = require('../tools/build-lexicon.js');
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    check(data.entries.length === 87, `${f}: 87 sentences, got ${data.entries.length}`);
    let bad = 0;
    for (const e of data.entries) {
      if (TOOL.problems(e.pidgin, e.out).length) bad++;
      if (e.reviewed && !e.out) bad++;
    }
    check(bad === 0, `${f}: ${bad} invalid line(s)`);
  }

  console.log(`${checks} checks, failures ${fails}`);
  process.exit(fails ? 1 : 0);
})();
