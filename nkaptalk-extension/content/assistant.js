/*
 * NkapTalk — the conversation.
 * Understands what the user wants (nlu.js), reads the screen (screen.js) and acts,
 * one step at a time, in Pidgin. Replies are fixed Pidgin sentences filled with the
 * page's exact values; the AI never writes them.
 *
 * Safety rules enforced here, in code:
 *  - before any button that moves money (Confirm), NkapTalk reads back the screen's values and waits for "yes"
 *  - the "I have verified / I confirm" boxes are only ticked after the user says "yes"
 *  - NkapTalk never fills PIN, password or code fields
 *  - unclear amounts are asked again
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});
  const SC = () => P.screen;

  const S = {
    awaiting: null, // which answer NkapTalk is waiting for: amount | type | name | phone | reason
    question: '',
    pending: null, // { run, cancelText } waiting for yes/no
    flow: null, // 'transfer' | 'fees' | null
    slots: {},
    last: '',
    slow: false,
    lastAlert: '',
    active: false,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Pidgin for a string written by the page (keeps its values). */
  function pid(s) {
    if (!s) return '';
    const r = P.translator.translateSync(s);
    return r ? r.text : s;
  }

  function fmt(n) {
    return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
  }

  const TYPE_NAME = { safinum: 'Safinum account', mobile_money: 'Mobile Money', other_bank: 'another bank' };

  function say(text, opts = {}) {
    S.last = text;
    // Shown in the chosen language when every piece of the reply has been translated, and in
    // Pidgin otherwise. What is SPOKEN stays Pidgin: a browser voice cannot read these
    // languages, and the recordings are keyed by the Pidgin piece, so speech.js wants Pidgin
    // either way and plays the local recording when one exists.
    let shown = text;
    if (P.replybook) {
      try {
        const local = P.replybook.localize(text, !!P.env.settings.showDrafts);
        if (local) shown = local;
      } catch (e) { shown = text; }
    }
    P.ui && P.ui.addMessage('nkaptalk', shown);
    return P.speech.speak(text, { slow: S.slow || opts.slow });
  }

  function ask(slot, question) {
    S.awaiting = slot;
    S.question = question;
    return say(question);
  }

  function confirmFirst(text, run, cancelText) {
    S.pending = { run, cancelText: cancelText || 'Okay, I no do am. Wetin you wan do?' };
    return say(text);
  }

  async function clickAndWait(btn) {
    const before = SC().detect();
    SC().click(btn);
    await SC().waitFor(() => SC().detect() !== before || SC().readAlert(), 3000);
    await sleep(250);
  }

  // ---------- Reading ----------

  const dot = (s) => (/[.!?:]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

  function alertText(a) {
    return a.all.map((x) => dot(pid(x))).join(' ');
  }

  function describe() {
    const scr = SC().detect();
    const v = SC().readPairs();
    const a = SC().readAlert();
    const alert = a ? ` Dis message dey screen: ${alertText(a)}` : '';
    switch (scr) {
      case 'dashboard': {
        const acct = SC().readAccount();
        return say(`Dis na your account page. Moni wey dey your account na ${v.balance}.${acct ? ` Account number na ${acct}.` : ''}${alert} You fit tell me: "I wan send moni", "Wetin be di charge", or "Wetin I don spend".`);
      }
      case 'fees': {
        const amt = SC().findField('amount');
        return say(`Dis na di page for charge. Kind of transfer na ${pid(SC().selectedTypeText())}. Amount na ${amt && amt.value ? fmt(amt.value) : 'nothing yet'}. Charge na ${v.fee}. Total wey dem go comot na ${v.total}. Balance after go be ${v.after}.${alert} Tell me how much you wan send, or say "continue".`);
      }
      case 'beneficiary': {
        const n = SC().findField('name');
        const ph = SC().findField('phone');
        return say(`Dis page na for di pesin wey go collect: di name, di phone number, and why you di send.${n && n.value ? ` Name for inside now na ${n.value}.` : ''}${ph && ph.value ? ` Phone na ${ph.value}.` : ''}${alert} Tell me di name of di pesin, make I put am.`);
      }
      case 'summary':
        return say(`${summaryText(v)}${alert} If all correct, say "confirm". If no, say "change am".`);
      case 'receipt':
        return say(receiptText(v));
      default: {
        const texts = SC().mainTexts(6).map(pid);
        const btns = SC().buttons().map((b) => pid(P.translator.origText(b))).filter(Boolean).slice(0, 5);
        return say(`For dis screen: ${texts.join('. ')}.${alert}${btns.length ? ` Di button dem na: ${btns.join(', ')}.` : ''}`);
      }
    }
  }

  function summaryText(v) {
    return `Check am well. Amount na ${v.amount}. Charge na ${v.fee}. Total wey dem go comot na ${v.total}. Di pesin wey go collect na ${v.beneficiary}, phone ${v.phone}. Kind of transfer: ${pid(v.operation)}. Reference na ${v.reference}.`;
  }

  function receiptText(v) {
    return `Transfer don go! Status: ${pid(v.status)}. Amount na ${v.amount}, total wey dem comot na ${v.total}, for ${v.beneficiary}. Reference na ${v.reference}. Keep dis reference.`;
  }

  function readBalance() {
    const v = SC().readPairs();
    if (!v.balance) return say('I no see your balance for dis screen.');
    return say(`Moni wey dey your account na ${v.balance}.`);
  }

  function readHistory() {
    const rows = SC().readTransactions();
    if (!rows.length) return say('Di list of moni wey move dey for your account page. Say "go back" till you reach am.');
    const parts = rows.slice(0, 4).map((r) => `${pid(r.title)}, ${r.date}, ${r.amount}`);
    return say(`Di last moni wey move: ${parts.join('. ')}.`);
  }

  // ---------- Guided transfer ----------

  function resetFlow() {
    S.flow = null;
    S.slots = {};
    S.awaiting = null;
    S.pending = null;
  }

  function mergeSlots(r) {
    for (const k of ['amount', 'type', 'name', 'phone']) if (r[k] != null && r[k] !== '') S.slots[k] = r[k];
  }

  async function advance() {
    const scr = SC().detect();
    const slots = S.slots;

    if (scr === 'dashboard' || scr === 'receipt') {
      const b = SC().findButton('transfer');
      if (!b) return describe();
      await clickAndWait(b);
      return advance();
    }

    if (scr === 'fees') {
      if (!slots.type) return ask('type', 'Which kind transfer you wan do? Safinum account, Mobile Money, or another bank?');
      SC().selectType(slots.type);
      if (slots.amount == null) return ask('amount', 'How much you wan send?');
      if (!(slots.amount > 0)) { slots.amount = null; return ask('amount', 'Di amount must pass zero. How much you wan send?'); }
      SC().setValue(SC().findField('amount'), slots.amount);
      await sleep(300);
      const v = SC().readPairs();
      const short = /^[-−]/.test(v.after || '') ? ' Hmm, your moni no go reach for dis one.' : '';
      const head = `For ${fmt(slots.amount)} with ${TYPE_NAME[slots.type]}: charge na ${v.fee}. Total wey dem go comot na ${v.total}. Your balance after go be ${v.after}.${short}`;
      if (S.flow === 'fees') {
        S.flow = null;
        S.feeSlots = { amount: slots.amount, type: slots.type };
        return say(`${head} If you wan send am, say "send am".`);
      }
      return confirmFirst(`${head} Make I go front?`, async () => {
        await clickAndWait(SC().findButton('continue'));
        if (SC().readAlert()) return; // the alert announcer speaks and asks again
        return advance();
      }, 'Okay. Tell me another amount, or say "go back".');
    }

    if (scr === 'beneficiary') {
      if (!slots.name) return ask('name', 'Wetin be di name of di pesin wey go collect?');
      SC().setValue(SC().findField('name'), slots.name);
      if (!slots.phone) return ask('phone', 'Wetin be di phone number? Talk am one by one.');
      SC().setValue(SC().findField('phone'), slots.phone);
      if (slots.reason === undefined) return ask('reason', 'Why you di send di moni? If you no wan talk am, say "skip".');
      const rf = SC().findField('reason');
      if (rf && slots.reason) SC().setValue(rf, slots.reason);
      const name = SC().findField('name').value;
      const phone = SC().findField('phone').value;
      return confirmFirst(`Make we check am: di name na ${name}, di phone number na ${phone}. Na correct?`, async () => {
        SC().check(SC().findField('attest'), true);
        await sleep(150);
        await clickAndWait(SC().findButton('continue'));
        if (SC().readAlert() && SC().detect() === 'beneficiary') return;
        return advance();
      }, 'Okay. Tell me di correct name, or say "change am".');
    }

    if (scr === 'summary') {
      const v = SC().readPairs();
      return confirmFirst(`${summaryText(v)} I go tick say all dis information correct, and press "Confirm di transfer". Make I send di moni?`, async () => {
        SC().check(SC().findField('attest'), true);
        await sleep(150);
        const btn = SC().findButton('confirm');
        await clickAndWait(btn);
        if (SC().detect() === 'receipt') {
          const r = SC().readPairs();
          resetFlow();
          return say(receiptText(r));
        }
      }, 'Okay, I no send am. If you wan change something, say "change am".');
    }

    return describe();
  }

  async function startTransfer(r) {
    if (S.flow !== 'transfer') S.slots = { ...(S.feeSlots || {}) };
    S.feeSlots = null;
    S.flow = 'transfer';
    mergeSlots(r);
    if (SC().detect() === 'receipt') {
      const b = SC().findButton('transfer');
      if (b) await clickAndWait(b);
    }
    return advance();
  }

  async function startFees(r) {
    S.flow = 'fees';
    S.slots = { ...S.slots };
    mergeSlots(r);
    let scr = SC().detect();
    if (scr === 'dashboard') { await clickAndWait(SC().findButton('fees')); scr = SC().detect(); }
    if (scr !== 'fees') { S.flow = null; return describe(); }
    if (!S.slots.type) S.slots.type = SC().findField('type').value || 'safinum';
    if (S.slots.type) SC().selectType(S.slots.type);
    if (S.slots.amount == null) {
      S.flow = null;
      await sleep(250);
      // the fee rule the page shows under the transfer type, read as written
      const sel = SC().findField('type');
      const note = sel && sel.nextElementSibling ? P.translator.origText(sel.nextElementSibling) : '';
      return say(`Kind of transfer na ${pid(SC().selectedTypeText())}. ${note ? pid(note) + '. ' : ''}Tell me how much you wan send, make I calculate di charge. Or tell me another kind transfer: Safinum account, Mobile Money, or another bank.`);
    }
    return advance();
  }

  // ---------- Answers to questions ----------

  function fillAwaiting(r) {
    switch (S.awaiting) {
      case 'amount':
        if (r.amount != null) { S.slots.amount = r.amount; return true; }
        return false;
      case 'type':
        if (r.type) { S.slots.type = r.type; return true; }
        return false;
      case 'name':
        if (r.name) { S.slots.name = r.name; return true; }
        return false;
      case 'phone':
        if (r.phone) { S.slots.phone = r.phone; return true; }
        return false;
      case 'reason': {
        const t = (r.heard || '').trim();
        if (!t) return false;
        S.slots.reason = /^(skip|no|nothing|leave am|pass)\b/i.test(t) ? '' : (r.reason || t);
        return true;
      }
      default: return false;
    }
  }

  // ---------- Main entry ----------

  const OFF_TOPIC = 'Abeg, I fit help you only for your bank matter: your balance, di charge, or to send moni.';
  const HELP = 'You fit tell me: "How much moni dey my account?", "Wetin be di charge?", "I wan send 5000 give Ngwa Paul", "Wetin dey for screen?", or "Say am again". I go ask you before I send any moni.';

  async function route(r) {
    if (r.engine === 'error' || (!r.heard && !r.intent)) return say('I no hear you well. Abeg talk again.');

    if (r.intent === 'STOP') { P.speech.stop(); return; }
    if (r.intent === 'REPEAT') return say(S.last || 'I never talk anything yet.');
    if (r.intent === 'SLOW') { S.slow = true; return say(S.last || 'Okay, I go talk slow.'); }
    if (r.intent === 'HELP') return say(HELP);
    if (r.intent === 'TRANSLATE_OFF') { P.translator.setOn(false); return say('Okay, I don show di page for di original language.'); }
    if (r.intent === 'TRANSLATE_ON') { P.translator.setOn(true); return say(P.translator.language === 'pcm' ? 'Okay, di page dey for Pidgin now.' : `Okay, di page dey for ${P.localize.LANGUAGES[P.translator.language].name} now. I go still talk Pidgin.`); }

    if (S.pending) {
      const p = S.pending;
      if (r.yes && !r.no) { S.pending = null; return p.run(); }
      if (r.no) { S.pending = null; return say(p.cancelText); }
      S.pending = null; // the user moved on to something else
    }

    if (S.awaiting) {
      if (fillAwaiting(r)) {
        S.awaiting = null;
        if (r.type && !S.slots.type) S.slots.type = r.type;
        if (r.amount != null && S.slots.amount == null && S.awaiting !== 'phone') S.slots.amount = r.amount;
        return advance();
      }
      if (!r.intent || r.intent === 'OFF_TOPIC') return say(`I no catch am. ${S.question}`);
      S.awaiting = null;
    }

    switch (r.intent) {
      case 'GREET':
      case 'READ_SCREEN': return describe();
      case 'BALANCE': return readBalance();
      case 'HISTORY': return readHistory();
      case 'FEES': return startFees(r);
      case 'TRANSFER': return startTransfer(r);
      case 'CONTINUE':
        if (SC().detect() === 'fees' && S.flow !== 'transfer') { S.flow = 'transfer'; S.slots.type = S.slots.type || SC().findField('type').value; const a = SC().findField('amount'); if (S.slots.amount == null && a && a.value) S.slots.amount = Number(a.value); }
        if (!S.flow) S.flow = 'transfer';
        return advance();
      case 'CONFIRM':
        if (!S.flow) S.flow = 'transfer';
        return advance();
      case 'BACK': {
        const b = SC().findButton('back');
        if (!b) return say('I no see "go back" for dis screen.');
        resetFlow();
        await clickAndWait(b);
        return describe();
      }
      case 'EDIT': {
        const b = SC().findButton('edit') || SC().findButton('back');
        if (!b) return say('I no see "change am" for dis screen.');
        S.slots.name = null; S.slots.phone = null; S.slots.reason = undefined;
        S.flow = 'transfer';
        await clickAndWait(b);
        return advance();
      }
      case 'OFF_TOPIC': return say(OFF_TOPIC);
      default:
        if (r.amount != null) { S.flow = S.flow || 'transfer'; S.slots.amount = r.amount; return advance(); }
        return say(`I no understand. ${HELP}`);
    }
  }

  let busy = false;
  async function handle(input) {
    if (busy) return;
    busy = true;
    try {
      P.ui && P.ui.setStatus('thinking');
      const r = await P.nlu.understand(input, S.awaiting, S.last);
      if (r.heard) P.ui && P.ui.addMessage('user', r.heard);
      P.ui && P.ui.setStatus('idle');
      await route(r);
    } catch (e) {
      console.error('[NkapTalk]', e);
      await say('Something no work well for my side. Abeg try again.');
    } finally {
      busy = false;
      P.ui && P.ui.setStatus('idle');
    }
  }

  // ---------- New content: errors, warnings, anything the jury adds ----------

  let announceTimer = null;
  let bucket = [];

  function onNewText(results) {
    bucket.push(...results);
    clearTimeout(announceTimer);
    announceTimer = setTimeout(announce, 450);
  }

  async function announce() {
    const items = bucket;
    bucket = [];
    const a = SC().readAlert();
    const key = a ? a.all.join('|') : '';
    if (key && key !== S.lastAlert) {
      S.lastAlert = key;
      if (S.active) {
        await say(`Attention! ${alertText(a)}`);
        if (/^AMOUNT_/.test(a.code || '') && S.flow) { S.slots.amount = null; return ask('amount', 'How much you wan send?'); }
      }
      return;
    }
    if (!key) S.lastAlert = '';
    if (!S.active) return;
    const alertParts = new Set(a ? a.all : []);
    const fresh = items.filter((x) => (x.how === 'unknown' || x.how === 'warning' || x.how === 'ai') && x.node && x.node.isConnected && SC().visible(x.node.parentElement) && !alertParts.has(x.orig) && x.orig.split(/\s+/).length >= 2);
    if (!fresh.length) return;
    const lines = fresh.slice(0, 3).map((x) => {
      if (x.waitingAI) return null; // spoken when the translation arrives
      if (x.out) return x.out;
      return `(I never get Pidgin for dis one yet, na di original:) ${x.orig}`;
    }).filter(Boolean);
    if (lines.length) await say(`New message for screen: ${lines.join('. ')}`);
  }

  function onLate(done) {
    if (!S.active) return;
    const fresh = done.filter((x) => x.node.isConnected && SC().visible(x.node.parentElement));
    if (fresh.length) say(`New message for screen: ${fresh.slice(0, 3).map((x) => x.out).join('. ')}`);
  }

  function activate() {
    S.active = true;
    S.slow = false;
    say('How you dey! I be NkapTalk. I go help you use dis bank for Pidgin.').then(() => describe());
  }

  function deactivate() {
    S.active = false;
    resetFlow();
    P.speech.stop();
    P.speech.stopRecording();
  }

  P.assistant = { handle, route, describe, activate, deactivate, onNewText, onLate, state: S, say };
})();
