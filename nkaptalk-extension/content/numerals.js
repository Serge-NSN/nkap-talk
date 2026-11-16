/*
 * NkapTalk — numbers as words, in the language that will read them out.
 *
 * Amounts are the one thing that must never be wrong, so they are never produced by a model:
 * this file turns an exact value from the page into a fixed list of words, and nothing else
 * decides what those words are.
 *
 * Two sets of words are supported:
 *   en  — what the Pidgin voice already uses ("five thousand, one hundred franc").
 *   fr  — French ("cinq mille cent francs"), for the local-language voices.
 *
 * Why French numbers inside an Ewondo or Duala sentence: money is counted in French across
 * Cameroon, including by speakers using their own language for everything else, so this is
 * what people actually say rather than a shortcut. It also keeps us from inventing numerals
 * in a language we cannot check, and French numbers carry no tone, so splicing one into a
 * recorded sentence cannot put a wrong tone on an amount. A language whose speakers want
 * their own numerals supplies them as recordings and a lexicon; see audio/<lang>/.
 *
 * Spelling note: in French the written plural is silent, so "cent"/"cents",
 * "franc"/"francs", "million"/"millions" need one recording each, not two.
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});

  // ---------- French ----------
  const FR_ONES = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const FR_TENS = { 20: 'vingt', 30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante' };

  function frBelow100(n) {
    if (n < 17) return [FR_ONES[n]];
    if (n < 20) return ['dix', FR_ONES[n - 10]];
    if (n < 70) {
      const t = Math.floor(n / 10) * 10;
      const r = n % 10;
      if (r === 0) return [FR_TENS[t]];
      if (r === 1) return [FR_TENS[t], 'et', 'un'];
      return [FR_TENS[t], FR_ONES[r]];
    }
    if (n < 80) return n === 71 ? ['soixante', 'et', 'onze'] : ['soixante', ...frBelow100(n - 60)];
    return n === 80 ? ['quatre', 'vingt'] : ['quatre', 'vingt', ...frBelow100(n - 80)];
  }

  function frBelow1000(n) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (!h) return frBelow100(r);
    const out = h === 1 ? ['cent'] : [FR_ONES[h], 'cent'];
    return r ? out.concat(frBelow100(r)) : out;
  }

  function frInt(n) {
    if (n === 0) return ['zero'];
    const out = [];
    for (const [v, w] of [[1e9, 'milliard'], [1e6, 'million']]) {
      if (n >= v) {
        const c = Math.floor(n / v);
        out.push(...(c === 1 ? ['un'] : frBelow1000(c)), w);
        n %= v;
      }
    }
    if (n >= 1000) {
      const c = Math.floor(n / 1000);
      out.push(...(c === 1 ? [] : frBelow1000(c)), 'mille'); // "mille", never "un mille"
      n %= 1000;
    }
    if (n > 0) out.push(...frBelow1000(n));
    return out;
  }

  // ---------- Shared parsing of what the page shows ----------
  /** "250 000" / "250,000" / "1,5" / "1.5" -> { sign, int, dec } or null. */
  function parse(raw) {
    let s = String(raw).trim().replace(/[−–]/g, '-');
    let sign = '';
    if (s[0] === '-') { sign = 'minus'; s = s.slice(1); }
    else if (s[0] === '+') { sign = 'plus'; s = s.slice(1); }
    s = s.trim();
    const grouped = s.match(/^(\d{1,3}(?:[\s  .,]\d{3})+)(?:[.,](\d+))?$/);
    if (grouped) return { sign, int: grouped[1].replace(/[^\d]/g, ''), dec: grouped[2] || '' };
    const plain = s.match(/^(\d+)(?:[.,](\d+))?$/);
    if (plain) return { sign, int: plain[1], dec: plain[2] || '' };
    return null;
  }

  const EN_SIGN = { minus: 'minus', plus: 'plus' };
  const FR_SIGN = { minus: 'moins', plus: 'plus' };

  const fr = {
    code: 'fr',
    sign: FR_SIGN,
    point: 'virgule',
    currency: 'franc',
    percent: ['pour', 'cent'],
    /** Exact value -> the words that say it, as a list. Returns null if it is not a number. */
    words(raw) {
      const p = parse(raw);
      if (!p) return null;
      const out = p.sign ? [FR_SIGN[p.sign]] : [];
      out.push(...frInt(parseInt(p.int, 10)));
      if (p.dec) out.push('virgule', ...p.dec.split('').map((c) => FR_ONES[+c]));
      return out;
    },
    digits(raw) {
      return String(raw).replace(/[^\d+]/g, '').split('').map((c) => (c === '+' ? 'plus' : FR_ONES[+c]));
    },
    // every word this set can ever produce: what a speaker has to record
    vocabulary() {
      const v = new Set([...FR_ONES, ...Object.values(FR_TENS), 'cent', 'mille', 'million',
        'milliard', 'et', 'virgule', 'moins', 'plus', 'franc', 'pour']);
      return [...v];
    },
  };

  const en = {
    code: 'en',
    sign: EN_SIGN,
    point: 'point',
    currency: 'franc',
    percent: ['percent'],
    /** Reuses speech.js so the Pidgin voice keeps saying exactly what it says today. */
    words(raw) {
      if (!P.speech || !P.speech.numberToWords) return null;
      if (!parse(raw)) return null;
      const s = P.speech.numberToWords(raw);
      if (s === raw) return null;
      return String(s).split(/[\s,-]+/).filter(Boolean);
    },
    digits(raw) {
      return String(raw).replace(/[^\d+]/g, '').split('').map((c) => (c === '+' ? 'plus' : c));
    },
    vocabulary() {
      const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
        'eighteen', 'nineteen'];
      const tens = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
      return [...ones, ...tens, 'hundred', 'thousand', 'million', 'billion', 'point', 'minus',
        'plus', 'franc', 'percent'];
    },
  };

  P.numerals = { fr, en, parse, get(code) { return code === 'fr' ? fr : en; } };
})();
