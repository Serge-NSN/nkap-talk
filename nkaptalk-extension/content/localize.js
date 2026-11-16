/*
 * NkapTalk — Cameroonian local languages for the PAGE (not the voice).
 *
 * The voice always stays Pidgin: browser voices read Pidgin spelling well, and no
 * voice today pronounces Ewondo, Duala or Fulfulde tones correctly. So:
 *   - what you SEE can be Pidgin or a local language (Gemini, values masked out)
 *   - what you HEAR is always Pidgin (phrasebook + exact values read in code)
 *
 * Safety is the same as for Pidgin: Gemini only receives text with every value
 * replaced by ⟦1⟧, ⟦2⟧..., and a translation is used only if every placeholder comes
 * back exactly once and the final text carries exactly the same values as the page.
 *
 * Corrections: native speakers can fix any line in the settings page
 * ("source text => translation", with {} / {1} for values like the phrasebook).
 * Corrections always win over Gemini.
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});

  // code -> display name and where it is mostly spoken (used in the Gemini prompt too)
  const LANGUAGES = {
    pcm: { name: 'Pidgin', full: 'Cameroonian Pidgin English', where: 'North West, South West, Littoral' },
    ff: { name: 'Fulfulde', full: 'Fulfulde (Adamawa Fulfulde, as spoken in Cameroon)', where: 'Adamawa, North, Far North' },
    ewo: { name: 'Ewondo', full: 'Ewondo (Beti)', where: 'Centre (Yaoundé)' },
    bum: { name: 'Bulu', full: 'Bulu (Beti)', where: 'South (Ebolowa)' },
    dua: { name: 'Duala', full: 'Duala', where: 'Littoral (Douala)' },
    bas: { name: 'Basaa', full: 'Basaa (Cameroon)', where: 'Centre, Littoral' },
    bbj: { name: "Ghomálá'", full: "Ghomálá' (Bamileke)", where: 'West (Bafoussam, Bandjoun)' },
    byv: { name: 'Medumba', full: 'Medumba (Bamileke)', where: 'West (Bangangté)' },
    lns: { name: "Lamnso'", full: "Lamnso'", where: 'North West (Kumbo)' },
  };

  const V = () => P.values;
  const norm = (s) => (P.phrasebook ? P.phrasebook.norm(s) : s.trim().toLowerCase());
  const shape = (masked) => norm(masked.replace(/⟦\d+⟧/g, '{}'));

  /**
   * "Solde disponible => Mbɔ́ŋ ..." lines -> Map(shape -> template).
   * Values in the source can be written as they appear or as {}; in the translation as {1}, {2}...
   * Lines starting with # are comments. Returns { table, errors }.
   */
  function parseFixes(text) {
    const table = new Map();
    const errors = [];
    String(text || '').split(/\r?\n/).forEach((line, i) => {
      const l = line.trim();
      if (!l || l.startsWith('#')) return;
      const at = l.indexOf('=>');
      if (at < 0) { errors.push(`line ${i + 1}: missing "=>"`); return; }
      const src = l.slice(0, at).trim();
      const out = l.slice(at + 2).trim();
      if (!src || !out) { errors.push(`line ${i + 1}: empty side`); return; }
      const masked = src.split('{}').map((f) => V().mask(f).masked).join('⟦0⟧');
      const slots = (masked.match(/⟦\d+⟧/g) || []).length;
      const used = (out.match(/\{(\d+)\}/g) || []).map((m) => Number(m.slice(1, -1)));
      if (used.some((n) => n < 1 || n > slots) || new Set(used).size !== slots || used.length !== slots) {
        errors.push(`line ${i + 1}: ${slots ? `the page text has ${slots} value(s): put ${Array.from({ length: slots }, (_, k) => `{${k + 1}}`).join(', ')} in the translation, once each` : 'no values in the page text, so no {1} in the translation'}`);
        return;
      }
      if (/\d/.test(out.replace(/\{\d+\}/g, ''))) { errors.push(`line ${i + 1}: digits must come from the page, use {1}, {2}...`); return; }
      table.set(shape(masked), out);
    });
    return { table, errors };
  }

  /** Correction for one page string, with the page's own values filled in, or null. */
  function lookupFix(table, core) {
    if (!table || !table.size) return null;
    const { masked, tokens } = V().mask(core.trim());
    const tpl = table.get(shape(masked));
    if (tpl == null) return null;
    const text = tpl.replace(/\{(\d+)\}/g, (m, n) => (tokens[Number(n) - 1] ? tokens[Number(n) - 1].value : m));
    return V().sameValues(core.trim(), text) ? text : null;
  }

  /**
   * Checks a Gemini translation of a masked string. Returns the final text with the page's
   * values put back, or null if anything about the values is off.
   */
  function accept(core, masked, out, tokens) {
    if (typeof out !== 'string' || !out.trim()) return null;
    out = out.trim();
    if (!V().placeholdersMatch(masked, out)) return null;
    // no digits of its own: every number must come from a placeholder
    if (/\d/.test(out.replace(/⟦\d+⟧/g, ''))) return null;
    const text = V().unmask(out, tokens);
    return V().sameValues(core.trim(), text) ? text : null;
  }

  P.localize = { LANGUAGES, parseFixes, lookupFix, accept, shape };
})();
