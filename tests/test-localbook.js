// Offline lexicons for the local languages: matching, the review gate, and value safety.
const fs = require('fs');
const path = require('path');
const load = require('./load');
// the sandbox has no fetch; this one answers from `reply`, which the test changes below
let reply = { ok: false };
const P = load(['values.js', 'phrasebook.js', 'localize.js', 'localbook.js'],
  { fetch: async () => reply });
const LB = P.localbook;
const TOOL = require('../tools/build-lexicon.js');

let fails = 0, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };

// 1. a lexicon source is shaped exactly like a Pidgin phrasebook key, so both match alike
check(LB.shapeOfSource('Solde disponible') === P.phrasebook.norm('solde disponible'), 'plain string shape');
check(LB.shapeOfSource('Numéro de compte : {}') === 'numéro de compte : {}', LB.shapeOfSource('Numéro de compte : {}'));
check(LB.shapeOfSource('Frais : {} pour {}').split('{}').length === 3, 'two slots survive shaping');

// 2. the review gate. Text stands in for a real translation; no real one is invented here.
const fixture = {
  language: 'ewo', name: 'Ewondo',
  entries: [
    { src: 'Solde disponible', pidgin: 'Moni wey dey your account', out: 'REVIEWED-BALANCE', reviewed: true, by: 'A. Speaker' },
    { src: 'Numéro de compte : {}', pidgin: 'Account number : {1}', out: 'REVIEWED-ACCT {1}', reviewed: true, by: 'A. Speaker' },
    { src: 'Effectuer un transfert', pidgin: 'Send moni', out: 'DRAFT-TRANSFER', reviewed: false, by: '' },
    { src: 'Consulter les frais', pidgin: 'Look di charge', out: '', reviewed: false, by: '' },
  ],
};
const tmp = path.join(require('os').tmpdir(), 'nkaptalk-lexicon-test.json');
fs.writeFileSync(tmp, JSON.stringify(fixture));

// load() fetches in the browser; in Node the table is filled from the same shape of data
(function loadFixture() {
  // mirror load()'s table building through the public shaping helper
  const entries = fixture.entries.filter((e) => e.out);
  check(entries.length === 3, 'fixture has three filled lines');
})();

(async () => {
  reply = { ok: true, json: async () => fixture };
  const counts = await LB.load('ewo');
  check(counts.lines === 4, `4 lines, got ${counts.lines}`);
  check(counts.filled === 3, `3 filled, got ${counts.filled}`);
  check(counts.reviewed === 2, `2 reviewed, got ${counts.reviewed}`);

  const ok = LB.lookup('Solde disponible');
  check(ok && ok.text === 'REVIEWED-BALANCE', 'reviewed line is used');
  check(ok && ok.how === 'lexicon', 'reviewed line reports "lexicon"');
  check(ok && ok.by === 'A. Speaker', 'reviewer is carried through');

  check(LB.lookup('Effectuer un transfert') === null, 'unreviewed draft withheld by default');
  const draft = LB.lookup('Effectuer un transfert', true);
  check(draft && draft.text === 'DRAFT-TRANSFER', 'draft used when drafts are allowed');
  check(draft && draft.how === 'draft', 'draft reports "draft", so the panel can say so');

  check(LB.lookup('Consulter les frais', true) === null, 'empty line is not a translation');
  check(LB.lookup('Quelque chose inconnu', true) === null, 'unknown string -> null');

  // 3. the page's own value goes back into the slot, unchanged
  const withVal = LB.lookup('Numéro de compte : SAF-001-2026');
  check(withVal && withVal.text === 'REVIEWED-ACCT SAF-001-2026', `value filled: ${withVal && withVal.text}`);

  // 4. switching to Pidgin clears the table, so no local text leaks into Pidgin mode
  await LB.load('pcm');
  check(LB.lookup('Solde disponible', true) === null, 'Pidgin mode has no lexicon');
  check(LB.counts.lines === 0, 'counts reset for Pidgin');

  // 5. a lexicon that will not load leaves everything null rather than throwing
  reply = { ok: false };
  await LB.load('dua');
  check(LB.lookup('Solde disponible', true) === null, 'missing lexicon file is survivable');

  // 6. the generator refuses lines whose value slots do not line up
  check(TOOL.problems('Solde disponible', 'Mbolo').length === 0, 'no slots, no slots used: fine');
  check(TOOL.problems('Numéro de compte : {}', 'Nomba {1}').length === 0, 'one slot used once: fine');
  check(TOOL.problems('Numéro de compte : {}', 'Nomba').length === 1, 'missing slot refused');
  check(TOOL.problems('Numéro de compte : {}', 'Nomba {1} {1}').length === 1, 'repeated slot refused');
  check(TOOL.problems('Numéro de compte : {}', 'Nomba {2}').length === 1, 'out-of-range slot refused');
  check(TOOL.problems('Solde disponible', 'Mbolo {1}').length === 1, 'slot with no value refused');
  check(TOOL.problems('Frais : {}', 'Nkap 100 {1}').length === 1, 'a digit written by hand refused');
  check(TOOL.problems('Frais : {}', '').length === 0, 'not filled in yet is not an error');
  check(TOOL.slots('Frais : {} pour {}') === 2, 'slot counting');

  // a number spelled out is how an invented amount really arrives: no digit to catch
  check(TOOL.problems('Frais : {}', 'Frais be cinq mille {1}').length === 1, 'spelled-out amount refused');
  check(TOOL.problems('Montant : {}', 'Montant : {1} mille').length === 1, 'trailing scale word refused');
  check(TOOL.problems('Montant : {}', 'Montant : {1} thousand').length === 1, 'English scale word refused');
  check(TOOL.problems('Frais : {}', 'Frais be {1}').length === 0, 'a bare slot is fine');
  // the same word either side of the accent is not an invented number
  check(TOOL.problems('The amount must be greater than zero.', 'Nseñ u nlama tagbe zéro.').length === 0,
    'English "zero" against "zéro" is the same word');
  check(TOOL.problems('Le montant doit être supérieur à zéro.', 'Nkà tsà zero.').length === 0,
    'French "zéro" against "zero" is the same word');
  // a number word in the source may be reused
  check(TOOL.problems('Cinq transferts', 'Cinq mam').length === 0, 'number word present in the source is allowed');

  // 7. every shipped lexicon is valid JSON, covers the page, and invents nothing
  const dir = path.join(__dirname, '..', 'nkaptalk-extension', 'lexicon');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  check(files.length === 8, `8 lexicons shipped, found ${files.length}`);
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    check(Array.isArray(data.entries) && data.entries.length > 150, `${f}: covers the page (${data.entries.length} lines)`);
    let bad = 0;
    for (const e of data.entries) {
      if (TOOL.problems(e.src, e.out).length) bad++;
      if (e.reviewed && !e.out) bad++;
    }
    check(bad === 0, `${f}: ${bad} invalid line(s)`);
  }

  // 8. a model handed the same answer twice, with one word swapped
  const byvPath = path.join(__dirname, '..', 'nkaptalk-extension', 'lexicon', 'byv.json');
  const byv = fs.existsSync(byvPath) ? JSON.parse(fs.readFileSync(byvPath, 'utf8')) : { entries: [] };
  const byvFilled = byv.entries.filter((e) => e.out);
  if (byvFilled.length > 40) {
    // the Medumba text back again as if it were Ghomala', with its word for money changed
    const copy = byv.entries
      .map((e, k) => ({ i: k + 1, out: e.out.replace(/nkàb/g, 'nkàp').replace(/Nkàb/g, 'Nkàp') }))
      .filter((r) => r.out);
    const hit = TOOL.recycled('bbj', copy);
    check(hit !== null, 'a recycled answer is detected');
    check(hit && hit.lang === 'byv', `names the language it was copied from (got ${hit && hit.lang})`);
    check(hit && hit.a === 'nkàp' && hit.b === 'nkàb', `names the swapped word (got ${hit && hit.a}/${hit && hit.b})`);
    check(TOOL.recycled('byv', copy) === null, 'a language is never compared against itself');

    // genuinely different text is not flagged
    const fresh = byv.entries
      .map((e, k) => ({ i: k + 1, out: e.out ? 'totally different line ' + k : '' }))
      .filter((r) => r.out);
    check(TOOL.recycled('bbj', fresh) === null, 'a genuinely different answer is not flagged');

    // a short answer is not enough to judge
    check(TOOL.recycled('bbj', copy.slice(0, 10)) === null, 'too few lines to judge -> no verdict');
  } else {
    console.log('note: byv lexicon not filled, skipping the recycled-answer checks');
  }

  fs.unlinkSync(tmp);
  console.log(`${checks} checks, failures ${fails}`);
  process.exit(fails ? 1 : 0);
})();
