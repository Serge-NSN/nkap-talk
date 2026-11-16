// Numbers as words: French for the local-language voices, English for Pidgin.
const load = require('./load');
const P = load(['values.js', 'phrasebook.js', 'numerals.js', 'speech.js']);
const fr = P.numerals.fr;
const en = P.numerals.en;

let fails = 0, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
const say = (n) => fr.words(String(n)).join(' ');

// 1. French, the awkward parts included
check(say(0) === 'zero', say(0));
check(say(1) === 'un', say(1));
check(say(16) === 'seize', say(16));
check(say(17) === 'dix sept', say(17));
check(say(21) === 'vingt et un', say(21));
check(say(22) === 'vingt deux', say(22));
check(say(31) === 'trente et un', say(31));
check(say(70) === 'soixante dix', say(70));
check(say(71) === 'soixante et onze', say(71));
check(say(72) === 'soixante douze', say(72));
check(say(79) === 'soixante dix neuf', say(79));
check(say(80) === 'quatre vingt', say(80));
check(say(81) === 'quatre vingt un', say(81)); // no "et" at eighty-one
check(say(91) === 'quatre vingt onze', say(91));
check(say(99) === 'quatre vingt dix neuf', say(99));
check(say(100) === 'cent', say(100));
check(say(101) === 'cent un', say(101));
check(say(200) === 'deux cent', say(200));
check(say(1000) === 'mille', say(1000)); // never "un mille"
check(say(2000) === 'deux mille', say(2000));
check(say(1000000) === 'un million', say(1000000)); // but "un million"
check(say(1000000000) === 'un milliard', say(1000000000));

// 2. the amounts a bank actually shows
check(say(5100) === 'cinq mille cent', say(5100));
check(say(25000) === 'vingt cinq mille', say(25000));
check(say(250000) === 'deux cent cinquante mille', say(250000));
check(say(900000) === 'neuf cent mille', say(900000));
check(fr.words('250 000').join(' ') === 'deux cent cinquante mille', 'spaced thousands');
check(fr.words('250,000').join(' ') === 'deux cent cinquante mille', 'comma thousands');
check(fr.words('1,5').join(' ') === 'un virgule cinq', 'decimal comma');
check(fr.words('1.5').join(' ') === 'un virgule cinq', 'decimal point');
check(fr.words('-75')[0] === 'moins', 'negative');
check(fr.words('+75')[0] === 'plus', 'positive');
check(fr.words('abc') === null, 'not a number -> null');
check(fr.words('') === null, 'empty -> null');

// 3. the French vocabulary is closed: a speaker records a finite list and every amount works
const vocab = new Set(fr.vocabulary());
const missing = new Set();
const feed = (toks) => toks.forEach((w) => { if (!vocab.has(w)) missing.add(w); });
for (let n = 0; n <= 2000; n++) feed(fr.words(String(n)));
[5100, 9999, 25000, 99999, 250000, 900000, 999999, 1000000, 1500000, 87654321,
  999999999, 1000000000, 1234567890].forEach((n) => feed(fr.words(String(n))));
feed(fr.words('1,5'));
feed(fr.words('-250 000'));
feed(fr.digits('+237 6 99 00 11 22'));
feed([fr.currency, ...fr.percent]);
check(missing.size === 0, `French words outside the vocabulary: ${[...missing].join(', ')}`);
check(vocab.size === 32, `French vocabulary is ${vocab.size} words`);

// 4. no French number word is ever a bare digit, or a clip could not be named after it
let bare = 0;
for (let n = 0; n <= 500; n++) fr.words(String(n)).forEach((w) => { if (/\d/.test(w)) bare++; });
check(bare === 0, 'no digit characters in French number words');

// 5. phone numbers are read digit by digit, in French
check(fr.digits('699001122').join(' ') === 'six neuf neuf zero zero un un deux deux', fr.digits('699001122').join(' '));
check(fr.digits('+237699').slice(0, 2).join(' ') === 'plus deux', 'leading plus kept');

// 6. English keeps saying exactly what the Pidgin voice says today
check(en.words('5 100').join(' ') === 'five thousand one hundred', en.words('5 100').join(' '));
check(en.words('21').join(' ') === 'twenty one', en.words('21').join(' '));
check(en.words('abc') === null, 'English: not a number -> null');
check(en.digits('699').join(' ') === '6 9 9', 'English digits stay characters (speech.js behaviour)');

// 7. parse() reads the shapes a page uses
check(P.numerals.parse('250 000').int === '250000', 'parse spaced');
check(P.numerals.parse('1,5').dec === '5', 'parse decimal');
check(P.numerals.parse('x') === null, 'parse rejects');
check(P.numerals.get('fr') === fr && P.numerals.get('en') === en, 'get() picks the set');

console.log(`${checks} checks, failures ${fails}`);
process.exit(fails ? 1 : 0);
