// Local languages: corrections parsing and the value checks on Gemini output.
const load = require('./load');
const P = load(['values.js', 'phrasebook.js', 'localize.js']);
const V = P.values;
const L = P.localize;

let fails = 0, checks = 0;
const check = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };

// 1. accept(): Gemini output is used only when values come back exactly
const src = 'Frais : 100 FCFA pour un envoi de 25 000 FCFA';
const { masked, tokens } = V.mask(src);
check(masked === 'Frais : ⟦1⟧ pour un envoi de ⟦2⟧', `mask: ${masked}`);
check(L.accept(src, masked, 'Nkap ⟦1⟧ ai ⟦2⟧', tokens) === 'Nkap 100 FCFA ai 25 000 FCFA', 'good translation accepted');
check(L.accept(src, masked, '⟦2⟧ ai ⟦1⟧', tokens) !== null, 'reordered placeholders accepted (values intact)');
check(L.accept(src, masked, 'Nkap ⟦1⟧', tokens) === null, 'dropped placeholder rejected');
check(L.accept(src, masked, 'Nkap ⟦1⟧ ⟦1⟧ ⟦2⟧', tokens) === null, 'duplicated placeholder rejected');
check(L.accept(src, masked, 'Nkap ⟦1⟧ ai ⟦3⟧', tokens) === null, 'invented placeholder rejected');
check(L.accept(src, masked, 'Nkap 200 FCFA ai ⟦2⟧', tokens) === null, 'value written by the model rejected');
check(L.accept(src, masked, 'Nkap ⟦1⟧ ai ⟦2⟧ 2', tokens) === null, 'extra digit rejected');
check(L.accept(src, masked, '', tokens) === null, 'empty rejected');
check(L.accept(src, masked, null, tokens) === null, 'non-string rejected');
const ref = 'Référence : SAF-2026-L8NV4F';
const r = V.mask(ref);
check(L.accept(ref, r.masked, 'Référence: ⟦1⟧', r.tokens) === 'Référence: SAF-2026-L8NV4F', 'reference kept byte for byte');

// 2. parseFixes(): native-speaker corrections
const { table, errors } = L.parseFixes([
  '# comment',
  'Solde disponible => Mone a ne',
  'Numéro de compte : {} => Nombre compte : {1}',
  'Frais : 100 FCFA => Nkap : {1}',
  'Bad line without arrow',
  'Montant : {} => Montant',
  'Total : {} => Total 5 {1}',
].join('\n'));
check(errors.length === 3, `3 bad lines reported: ${JSON.stringify(errors)}`);
check(table.size === 3, `3 good lines kept (${table.size})`);
check(L.lookupFix(table, 'Solde disponible') === 'Mone a ne', 'plain correction');
check(L.lookupFix(table, '  solde   disponible ') === 'Mone a ne', 'correction ignores case and spaces');
check(L.lookupFix(table, 'Numéro de compte : CM 001 2345 6789 01') === 'Nombre compte : CM 001 2345 6789 01', 'correction with value slot');
check(L.lookupFix(table, 'Frais : 2 500 FCFA') === 'Nkap : 2 500 FCFA', 'value written in source becomes a slot, page value used');
check(L.lookupFix(table, 'Autre chose') === null, 'no correction -> null');

// 3. every language has a name and region; Pidgin is the default
check(L.LANGUAGES.pcm && L.LANGUAGES.pcm.name === 'Pidgin', 'Pidgin present');
for (const [code, l] of Object.entries(L.LANGUAGES)) check(l.name && l.full && l.where, `language ${code} complete`);

console.log(`${checks} checks, failures ${fails}`);
process.exit(fails ? 1 : 0);
