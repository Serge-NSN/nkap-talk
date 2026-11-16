/* NkapTalk — start-up: translate the page, watch for new content, show the floating button. */
(function () {
  const P = globalThis.NkapTalk;
  if (!P || P.started) return;
  P.started = true;

  async function init() {
    await P.env.loadSettings();
    await P.translator.start(); // loads the display language first
    if (P.env.settings.autoTranslate) P.translator.setOn(true);
    // display language changed in settings, or native-speaker corrections edited
    let drafts = !!P.env.settings.showDrafts;
    P.env.on('settings', (s) => {
      const lang = s.pageLanguage || 'pcm';
      if (lang !== P.translator.language) { drafts = !!s.showDrafts; return P.translator.setLanguage(lang); }
      // showing or hiding unchecked lines changes what every line reads, so redraw the page
      if (!!s.showDrafts !== drafts) { drafts = !!s.showDrafts; P.translator.setLanguage(lang); }
    });
    P.env.on('local-store', (changes) => {
      if (Object.keys(changes).includes(`fix:${P.translator.language}`)) P.translator.setLanguage(P.translator.language);
    });
    P.env.on('new-text', (r) => P.assistant.onNewText(r));
    P.env.on('translated-late', (r) => P.assistant.onLate(r));
    P.ui.mount();
    if (P.env.hasChrome) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg && msg.type === 'toggle-panel') P.ui.toggle();
        if (msg && msg.type === 'toggle-translate') P.translator.setOn(!P.translator.on);
        if (msg && msg.type === 'talk') { if (!P.ui.open) P.ui.setOpen(true); P.ui.toggleMic(); }
      });
    }
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
