/*
 * NkapTalk — speaking and listening.
 * - toSpeech(): turns exact on-screen values into words a voice reads correctly
 *   ("5 100 FCFA" -> "five thousand, one hundred franc"; phone numbers digit by digit;
 *   references letter by letter). Done in code, never by the AI.
 * - speak(): browser voice (prefers voices that run on the device) or Gemini voice.
 * - record(): microphone -> 16 kHz WAV for Gemini; listen(): browser speech recognition.
 */
(function () {
  const P = (globalThis.NkapTalk = globalThis.NkapTalk || {});

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function below1000(n) {
    const parts = [];
    if (n >= 100) { parts.push(ONES[Math.floor(n / 100)] + ' hundred'); n %= 100; }
    if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')); }
    else if (n > 0 || !parts.length) parts.push(ONES[n]);
    return parts.join(' ');
  }

  function intToWords(n) {
    if (n === 0) return 'zero';
    const scales = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
    const parts = [];
    for (const [v, w] of scales) {
      if (n >= v) { parts.push(below1000(Math.floor(n / v)) + ' ' + w); n %= v; }
    }
    if (n > 0) parts.push(below1000(n));
    return parts.join(', ');
  }

  /** "250 000" / "250,000" / "1,5" / "1.5" -> words. */
  function numberToWords(raw) {
    let s = String(raw).trim().replace(/[−–]/g, '-');
    let sign = '';
    if (s[0] === '-') { sign = 'minus '; s = s.slice(1); }
    else if (s[0] === '+') { sign = 'plus '; s = s.slice(1); }
    s = s.trim();
    let intPart = s;
    let dec = '';
    // thousands separators: groups of exactly 3 digits
    const m = s.match(/^(\d{1,3}(?:[\s  .,]\d{3})+)(?:[.,](\d+))?$/);
    if (m) { intPart = m[1].replace(/[^\d]/g, ''); dec = m[2] || ''; }
    else {
      const d = s.match(/^(\d+)(?:[.,](\d+))?$/);
      if (!d) return raw;
      intPart = d[1]; dec = d[2] || '';
    }
    let words = intToWords(parseInt(intPart, 10));
    if (dec) words += ' point ' + dec.split('').map((c) => ONES[+c]).join(' ');
    return sign + words;
  }

  function digits(s) {
    return s.replace(/[^\d+]/g, '').split('').map((c) => (c === '+' ? 'plus' : c)).join(' ');
  }

  function spell(s) {
    return s.split('').map((c) => (c === '-' || c === '_' ? ',' : c)).join(' ').replace(/ , /g, ', ');
  }

  /** Text with exact values -> text a voice will read correctly. */
  function toSpeech(text) {
    const spans = P.values.findSpans(text);
    let out = '';
    let pos = 0;
    for (const s of spans) {
      out += text.slice(pos, s.start);
      const v = s.value;
      switch (s.kind) {
        case 'MONEY': {
          const num = v.replace(/(FCFA|F\s?CFA|XAF|CFA|francs?)/i, '').trim();
          out += numberToWords(num) + ' franc';
          break;
        }
        case 'PERCENT': out += numberToWords(v.replace('%', '').trim()) + ' percent'; break;
        case 'PHONE': out += digits(v); break;
        case 'REF': case 'CODE': case 'ACCOUNT': out += spell(v.replace(/\s+/g, '')); break;
        case 'NUMBER': out += numberToWords(v); break;
        case 'CURRENCY': out += /CFA/i.test(v) ? 'franc' : v; break;
        default: out += v;
      }
      pos = s.end;
    }
    out += text.slice(pos);
    return out.replace(/⚠/g, '').replace(/\s+/g, ' ').trim();
  }

  // ---------- Speaking ----------
  let muted = false;
  let audioCtx = null;
  let currentSource = null;

  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    const wanted = P.env.settings.voiceName;
    if (wanted) {
      const v = voices.find((x) => x.name === wanted);
      if (v) return v;
    }
    const prefs = ['en-NG', 'en-GH', 'en-KE', 'en-ZA', 'en-GB', 'en-US', 'en'];
    for (const lang of prefs) {
      // device voices first: nothing leaves the computer
      const local = voices.find((x) => x.lang && x.lang.replace('_', '-').startsWith(lang) && x.localService);
      if (local) return local;
    }
    for (const lang of prefs) {
      const any = voices.find((x) => x.lang && x.lang.replace('_', '-').startsWith(lang));
      if (any) return any;
    }
    return voices[0] || null;
  }

  function stop() {
    try { speechSynthesis.cancel(); } catch (e) {}
    try { if (currentSource) currentSource.stop(); } catch (e) {}
    try { if (P.clipvoice && P.clipvoice.stop) P.clipvoice.stop(); } catch (e) {}
    currentSource = null;
  }

  function speakBrowser(text, rate) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in globalThis)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = rate;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
      // Chrome sometimes never fires onend for long text
      setTimeout(resolve, Math.min(60000, 1500 + text.length * 90 / rate));
    });
  }

  async function speakGemini(text) {
    const res = await P.env.send({ type: 'tts', text });
    if (!res || !res.ok) return false;
    audioCtx = audioCtx || new AudioContext();
    const bytes = Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
    const rate = res.sampleRate || 24000;
    const buf = audioCtx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    return new Promise((resolve) => {
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(audioCtx.destination);
      src.onended = () => resolve(true);
      currentSource = src;
      src.start();
    });
  }

  /** Speak a reply. `text` keeps exact values; they are converted to words here. */
  async function speak(text, opts = {}) {
    // data-nkaptalk-mute="1" on <html> silences NkapTalk (used by automated tests)
    if (muted || !text || document.documentElement.dataset.nkaptalkMute === '1') return;
    stop();
    const spoken = toSpeech(text);
    const rate = (P.env.settings.rate || 0.95) * (opts.slow ? 0.75 : 1);
    // Recorded native-speaker voice first: best quality, offline, nothing leaves the
    // computer, and for the tonal local languages it is the only way to get the tones
    // right. It gets the text with its exact values, because it reads amounts with its own
    // language's numbers. Sentences it has no recording for fall through to the voices
    // below, in Pidgin, so a part-recorded language still answers every question.
    let rest = spoken;
    if (P.env.settings.useClipVoice && P.clipvoice && P.clipvoice.speak) {
      try {
        const lang = P.env.settings.voiceLanguage || 'pcm';
        const missed = await P.clipvoice.speak(text, { lang, rate });
        if (!missed.length) return;
        rest = toSpeech(missed.map((m) => m.text).join(' '));
      } catch (e) { rest = spoken; }
    }
    if (!rest.trim()) return;
    if (P.env.online() && P.env.settings.useGeminiTTS) {
      const ok = await speakGemini(rest);
      if (ok) return;
    }
    await speakBrowser(rest, rate);
  }

  // ---------- Listening ----------
  let recorder = null;

  /** Records until stop() or silence; resolves with base64 16 kHz mono WAV. */
  async function record({ maxMs = 9000, silenceMs = 1400, onLevel } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const chunks = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((resolve) => (mr.onstop = resolve));
    mr.start();
    recorder = mr;
    const data = new Uint8Array(analyser.fftSize);
    let heard = false;
    let quietSince = performance.now();
    const t0 = performance.now();
    const tick = () => {
      if (mr.state !== 'recording') return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) * (v - 128);
      const rms = Math.sqrt(sum / data.length) / 128;
      if (onLevel) onLevel(rms);
      const now = performance.now();
      if (rms > 0.04) { heard = true; quietSince = now; }
      if ((heard && now - quietSince > silenceMs) || now - t0 > maxMs) mr.stop();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await done;
    recorder = null;
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    if (!heard) return null;
    const blob = new Blob(chunks, { type: mr.mimeType });
    return toWav16k(await blob.arrayBuffer());
  }

  function stopRecording() {
    if (recorder && recorder.state === 'recording') recorder.stop();
  }

  async function toWav16k(arrayBuf) {
    const dec = new AudioContext();
    const audio = await dec.decodeAudioData(arrayBuf);
    dec.close();
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.ceil(audio.duration * rate), rate);
    const s = off.createBufferSource();
    s.buffer = audio;
    s.connect(off.destination);
    s.start();
    const r = await off.startRendering();
    const pcm = r.getChannelData(0);
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const dv = new DataView(buf);
    const str = (o, t) => [...t].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /** Browser speech recognition (fallback when Gemini is off). Resolves with text or ''. */
  function listen() {
    const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SR) return Promise.resolve('');
    return new Promise((resolve) => {
      const r = new SR();
      r.lang = 'en-NG';
      r.interimResults = false;
      r.maxAlternatives = 1;
      let text = '';
      r.onresult = (e) => { text = e.results[0][0].transcript; };
      r.onerror = () => resolve(text);
      r.onend = () => resolve(text);
      recorder = { state: 'recording', stop: () => r.stop() };
      r.start();
    });
  }

  P.speech = {
    toSpeech, numberToWords, speak, stop, record, stopRecording, listen,
    set muted(v) { muted = !!v; if (muted) stop(); },
    get muted() { return muted; },
  };
})();
