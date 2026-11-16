<div align="center">

# NkapTalk

**Use your bank in Cameroonian Pidgin, by voice, with every amount kept exactly right.**

*Built for the SAFINUM Innovate Challenge 2026 (Yaoundé)*

![NkapTalk on the SAFINUM test bank: the page in Pidgin, an error read out, and a new message announced](nkaptalk-screenshot.png)

</div>

---

## What is NkapTalk?

Most banking and mobile money apps in Cameroon only speak French or English. NkapTalk is a **Chrome extension** that sits on top of an online banking page, **without changing the bank's code**, and makes it usable in **Pidgin**:

| | What it does |
|---|---|
| 🌍 **Translates the page** | Buttons, labels, messages, errors and warnings switch to Pidgin as the page loads, including text that appears later. |
| 🎙 **Talks with you** | Ask by voice or by typing ("How much moni dey my account?"). NkapTalk reads the screen aloud and walks you through a transfer, filling and clicking for you. |
| 🔒 **Never changes a value** | Amounts, fees, totals, phone numbers, references, account numbers and names are locked before translation and checked after. If anything differs, the original stays. |
| ✋ **Asks before money moves** | Before pressing *Confirm*, NkapTalk reads back the amount, fee, total, receiver and reference from the screen and waits for your "yes". It never touches your PIN. |

It works with or without internet AI: with no API key, everything runs on your computer.

---

## Contents

1. [Install](#1-install)
2. [First use](#2-first-use)
3. [Talking to NkapTalk](#3-talking-to-nkaptalk)
4. [Settings: local mode or Gemini](#4-settings-local-mode-or-gemini)
5. [Practise offline](#5-practise-offline)
6. [Safety and integrity](#6-safety-and-integrity)
7. [Privacy: what leaves your computer](#7-privacy-what-leaves-your-computer)
8. [How it works](#8-how-it-works)
9. [Run the tests](#9-run-the-tests)
10. [Improve the Pidgin](#10-improve-the-pidgin)
11. [Troubleshooting](#11-troubleshooting)
12. [Known limitations](#12-known-limitations)
13. [Components used](#13-components-used)

---

## 1. Install

You need **Google Chrome** (or another Chromium browser such as Edge or Brave) on a computer.

1. **Download the code**
   - Click the green **Code** button on this page, then **Download ZIP**, and unzip it.
   - Or with git: `git clone https://github.com/Serge-NSN/nkap-talk.git`
2. Open Chrome and go to **`chrome://extensions`**
3. Turn on **Developer mode** (switch at the top right).
4. Click **Load unpacked** and select the **`nkaptalk-extension`** folder (the folder that contains `manifest.json`).
5. The NkapTalk settings page opens. You can leave everything as it is and click **Save**. See [Settings](#4-settings-local-mode-or-gemini) to add a Gemini key later.
6. Optional: click the puzzle icon 🧩 in Chrome's toolbar and pin **NkapTalk**.

> **Updating:** after downloading a new version, go back to `chrome://extensions` and click the ↻ reload icon on the NkapTalk card.

## 2. First use

1. Open the SAFINUM test bank: **https://safinum.cm/hackathon-test**
2. The page switches to **Pidgin** by itself ("Moni wey dey your account", "Send moni", "Look di charge"...).
3. Click the green **NkapTalk** button at the bottom right (or press **Alt + Shift + P**).
4. NkapTalk greets you and tells you what is on the screen.
5. Press the **🎙 microphone** and speak, or type in the box and press **Enter**.
6. The first time you use the mic, Chrome asks for permission: click **Allow**.

## 3. Talking to NkapTalk

### Keyboard shortcuts

| Keys | Action |
|---|---|
| **Alt + Shift + P** | Open or close NkapTalk |
| **Alt + Shift + M** | Start talking (press again, or just stop speaking, to finish) |
| **Alt + Shift + T** | Switch the page between Pidgin and its original language |
| **Esc** | Stop NkapTalk talking |
| **Tab** | Move between NkapTalk's buttons (works with screen readers) |

### Things you can say

| You say | NkapTalk does |
|---|---|
| *"Wetin dey for screen?"* / *"Where I dey?"* | Reads the current screen in Pidgin |
| *"How much moni dey my account?"* | Reads your balance |
| *"Wetin I don spend last time?"* | Reads your recent transactions |
| *"Wetin be di charge for mobile money?"* | Opens the fees page and reads the fee rule |
| *"How much dem go cut if I send 20000?"* | Calculates the fees for that amount, from the page |
| *"I wan send 5000 give Ngwa Paul for mobile money"* | Starts a guided transfer with what you said |
| *"Yes"*, *"Na so"*, *"Oya do am"* | Says yes to NkapTalk's question |
| *"No"*, *"Wait"*, *"E no correct"* | Says no: nothing is done |
| *"Go front"* / *"Go back"* / *"Change am"* | Continue / back / edit |
| *"Say am again"* / *"Talk small small"* | Repeat / speak slower |
| *"Show di French"* / *"Put am for Pidgin"* | Page in original language / in Pidgin |

You can also use the quick buttons in the panel: **Wetin dey here?**, **My balance**, **Send moni**, **Charge**, **Say am again**.

### A guided transfer, step by step

```
You:      I wan send 5000 give Ngwa Paul for mobile money
NkapTalk: For 5 000 FCFA with Mobile Money: charge na 100 FCFA. Total wey dem go comot
          na 5 100 FCFA. Your balance after go be 244 900 FCFA. Make I go front?
You:      Yes
NkapTalk: Wetin be di phone number? Talk am one by one.
You:      Six seven seven double one two three four five
NkapTalk: Why you di send di moni? If you no wan talk am, say "skip".
You:      Skip
NkapTalk: Make we check am: di name na Ngwa Paul, di phone number na +237 6 77 11 23 45. Na correct?
You:      Na so
NkapTalk: Check am well. Amount na 5 000 FCFA. Charge na 100 FCFA. Total wey dem go comot
          na 5 100 FCFA. Di pesin wey go collect na Ngwa Paul, phone +237 6 77 11 23 45.
          Reference na SAF-2026-…  I go tick say all dis information correct, and press
          "Confirm di transfer". Make I send di moni?
You:      Yes
NkapTalk: Transfer don go! Status: E don work. … Reference na SAF-2026-…
```

If the bank shows an error (for example *insufficient balance*) or a security warning, NkapTalk reads it out at once and asks what to do next.

## 4. Settings: local mode or Gemini

Open the settings by right-clicking the NkapTalk icon → **Options**, or from `chrome://extensions` → NkapTalk → **Details** → **Extension options**.

| Mode | How to get it | What you get |
|---|---|---|
| **Local mode** (default, no key) | Nothing to do | Page translated from NkapTalk's built-in Pidgin phrasebook; typed requests understood offline; voice via Chrome's speech recognition |
| **Gemini mode** | Paste a Gemini API key | Better understanding of free speech (accents, mixed Pidgin/English/French); translation of brand-new text the phrasebook doesn't know |

**Getting a Gemini API key:** go to https://aistudio.google.com/apikey, sign in with a Google account, click **Create API key**, copy it into **Gemini API key** in NkapTalk's settings, then click **Save**.

Other settings:

- **Understand my voice with Gemini:** sends only your voice or typed words, never the screen.
- **Translate new text with Gemini:** sends only unknown text, with all values removed (see [Privacy](#7-privacy-what-leaves-your-computer)).
- **Use Gemini's voice for replies:** off by default, because it sends the reply text, which includes amounts.
- **Translate the page as soon as it opens**, **Browser voice** and **Speaking speed**.

### Page in a Cameroonian language

Under **Page language** you can show the page in **Fulfulde, Ewondo, Bulu, Duala, Basaa, Ghomálá', Medumba or Lamnso'** instead of Pidgin. **NkapTalk keeps talking in Pidgin**: browser voices read Pidgin spelling well, but none pronounce the tones of these languages correctly, and a wrongly spoken amount is not acceptable in a bank.

- Translation is done by Gemini (a key is needed), with the **same value locking as Pidgin**: amounts, names, phones, references and account numbers are replaced by ⟦1⟧, ⟦2⟧… before sending, and a translation is shown only if every value comes back exactly. Gemini is also told never to write numbers itself, and any digit it adds gets the line refused.
- Until a line is translated, if a line is refused, or with no internet, the page shows **Pidgin** for that line.
- Translations are saved on the computer (without any values) so the page is instant next time and works offline.
- **Corrections from native speakers:** Gemini's quality in these languages varies and must be checked. Type fixes in the settings, one per line, `page text => translation`, with `{}` for a value in the page text and `{1}`, `{2}`… in the translation:
  ```
  Solde disponible => ...
  Numéro de compte : {} => ... {1}
  ```
  Corrections always win over Gemini. Lines with mistakes in the value slots are refused with a message.

### Offline lexicons for the local languages

Pidgin has a reviewed phrasebook built into the extension, so the page works with no key and
no internet. `lexicon/<language>.json` gives the other eight the same thing: every interface
string of the SAFINUM test environment, in French and English, with its reviewed Pidgin
alongside so a reviewer can see what each line means.

The translations are not generated. Every `out` field starts empty and is filled by native
speakers. Each line carries its own `reviewed` flag and the name of whoever checked it, and
NkapTalk shows **only reviewed lines** by default: an unreviewed line falls back to Pidgin
rather than showing an unchecked guess to someone moving money. **Show lines no native speaker
has checked yet** lifts that for testing.

The practical route from nothing to a reviewed lexicon:

1. Generate a prompt for the language. The whole file is the prompt: select all, paste it into
   Gemini. Lines are numbered and the model answers by number, so it never echoes a source
   string back and cannot quietly correct an accent or drop a value slot.
   ```bash
   node tools/build-lexicon.js prompt --all          # or: prompt ewo --chunk 60
   ```
2. Save the model's JSON answer and merge it. Everything arrives as a draft: nothing a model
   wrote is ever marked reviewed, whatever the file claims.
   ```bash
   node tools/build-lexicon.js merge ewo gemini-ewo.json
   ```
   Lines the model marked unsure keep their reason in `aiNote`, and the merge says how many
   there are, so review starts where it is most needed. Lines the model left blank are counted
   and skipped, which is a useful answer rather than a failure.

   Ask for one language per conversation. A model asked for several related languages in a row
   hands back what it wrote last time with a word or two changed, and `merge` refuses an answer
   that matches another language's wholesale, naming the language and the swapped word. Related
   languages do share vocabulary, so this only triggers on a whole answer matching, not on
   individual lines. `--force` overrides it.
3. A native speaker corrects the lines and sets `reviewed: true` with their name in `by`.
   A line already marked reviewed is never overwritten by a later draft.
4. Check the file. Value slots that do not line up, and any digit written by hand instead of
   coming from the page, are refused here rather than at runtime:
   ```bash
   node tools/build-lexicon.js check --all
   ```

The browser route works too, if the page has already been opened in that language with a key:
**Export Gemini drafts for review** in the settings writes out what Gemini has cached, with
`⟦1⟧` turned back into `{}` and `{1}`, and `merge` accepts that file as well.

Speakers can also skip Gemini entirely and fill the file in directly, or type corrections into
the settings page, which take effect immediately and win over everything else.

`node tools/build-lexicon.js stub --all` refreshes the files when the page's strings change,
keeping whatever has already been filled in and dropping lines that are no longer on the page.

Once a language has a reviewed lexicon and its recordings, it needs no key and nothing leaves
the computer, exactly like Pidgin.

### What NkapTalk itself says

The lexicon above covers the bank's page. NkapTalk's own sentences are a separate set, written
in Pidgin in `assistant.js` and filled with values from the screen as it speaks, so choosing
Ewondo used to leave it answering in Pidgin about an Ewondo page.

`lexicon/replies/<language>.json` holds those 87 sentences per language, and `replybook.js`
swaps the Pidgin pieces of a reply for them while leaving every value exactly as it is. The
pieces are the parts of a reply between its values, keyed by the Pidgin with case and
punctuation removed, which is the same key the recordings use: one translation round gives
both the text on screen and the script a speaker reads.

**What is spoken stays Pidgin.** A browser voice cannot read these languages, and the
recordings are keyed by the Pidgin piece, so `speech.js` keeps receiving Pidgin and plays the
local recording once one exists. You read the local language; you hear Pidgin until there is
a recorded voice.

A reply is swapped whole or not at all, an unchecked line is not shown, and the values are put
back and compared as everywhere else.

```bash
node tools/build-replies.js stub --all          # create the files
node tools/build-replies.js from-page --all     # reuse page lines that say the same thing
node tools/build-replies.js prompt --all        # one prompt per language
node tools/build-replies.js merge ewo answer.json
node tools/build-replies.js check --all
```

`from-page` takes the handful of sentences that are word for word a line of the bank's page,
which the page lexicon already has a translation for. They arrive as drafts like everything
else.

### The twenty lines to check first

Each language has 268 lines in all, and nobody reviews that before a deadline. The review
sheet picks the twenty where being wrong costs the most and writes something a speaker can
fill in on paper or on a phone:

```bash
node tools/review-sheet.js ewo            # -> lexicon/review-ewo.md
```

It takes turns between the kinds of line rather than filling the sheet with one kind, so it
covers the whole journey: what the app says about a PIN, its security warnings, confirming and
cancelling, the amounts, who the money goes to, the transfer, and errors. A draft the model
marked unsure outranks a confident one, and a line with nothing proposed is left out, because
a line with no draft shows nothing on screen anyway. Each entry carries the bank's own French,
the reviewed Pidgin, the proposed translation and the model's own doubt, so a reviewer can see
what the line is meant to mean before judging it.

Corrections go back in with the normal `merge`, and a line only appears once someone sets
`reviewed: true` with their name.

### Recorded voice, in Pidgin and in the local languages

Chrome's English voice reads Pidgin *spelling*, which is only close enough. For Ewondo,
Duala, Basaa, Ghomálá', Medumba and Lamnso' there is no usable voice at all, because they are
tonal: the same syllable at a different pitch is a different word, and no engine today places
those tones correctly. Fulfulde is not tonal, so it is the easier case. A recording by a
native speaker has the right tones by definition, so NkapTalk can speak all nine languages
once it has recordings. The files sit on the computer, so this works offline.

Tone is not a property of a word on its own: it shifts with the words around it. Cutting a
tonal language into word-sized pieces and gluing them back together can therefore produce a
tone, and so a word, that nobody said. Two rules follow, and both are enforced in code:

- **In a tonal language, a whole fragment between two values is one recording.** Fragments are
  never built up out of word clips. Having every word of a fragment is not enough and is
  refused. `clipvoice.js` does this with the `whole` option on `plan()`.
- **Only numbers are spliced in, and they are spoken in French.** Money is counted in French
  across Cameroon, including by speakers using their own language for everything else, so this
  is what people actually say. It also means no amount depends on numerals invented in a
  language we cannot check, and French carries no tone, so a splice can never put a wrong tone
  on an amount.

Recordings are keyed by the slug of the **Pidgin** fragment, while the audio holds the local
language. The assistant keeps composing its replies in Pidgin exactly as it does now, and the
voice needs no local-language text at runtime. Nothing a speaker records is passed through a
model afterwards.

Amounts are still never produced by a model. `numerals.js` turns an exact value from the page
into a fixed list of words, in French for the local voices and in English for Pidgin, and
nothing else decides what those words are.

Anything with no recording falls back to Pidgin, one sentence at a time, so a part-recorded
language still answers every question. Recordings and the browser voice are never mixed inside
one sentence.

The recording script for each language is generated from `assistant.js` and `phrasebook.js`,
so it stays in step with what NkapTalk actually says:

```bash
node tools/build-clips.js script --all      # or: script ewo dua
node tools/build-clips.js index --all       # after adding files; prints coverage
```

Each language comes out in three tiers. Pidgin needs 217 clips, each local language 212:

| Tier | Clips | Covers |
|---|---|---|
| 1 — numbers and letters | 63 Pidgin / 58 local | Every amount, fee, total, percentage, phone number and reference, for any value up to a billion. The vocabulary is closed, so this fixed list covers all of them. |
| 2 — NkapTalk's own sentences | 87 | Its greeting, questions, confirmations and errors. |
| 3 — page text read aloud | 67 | The SAFINUM screens as the phrasebook renders them. |

Record Tier 1 and Tier 2 first: together they are enough for NkapTalk to hold a whole
transfer conversation in the language, and Tier 1 is where a mispronounced word would matter
most in a bank.

The script for a local language is written in Pidgin, and the speaker says each line in their
own language. For a tonal language the script tells them to say each line in one go, because
that is what keeps the tones right.

Put the files in `nkaptalk-extension/audio/<language>/`, named with the id from the script
(`.webm`, `.ogg`, `.mp3`, `.m4a`, `.wav` or `.flac`), then run the `index` command. The
settings page has **Speak in** for choosing the voice, and shows how many recordings are
installed and whether amounts are covered yet. With none installed, the voice behaves exactly
as before.

## 5. Practise offline

The `practice-bank` folder holds an offline copy of the SAFINUM test page, with the same structure, texts (French and English), fee rules and errors. It also has a box to **inject a new message** the way the jury will.

```bash
cd practice-bank
python3 -m http.server 8000
```

Then open **http://localhost:8000** in Chrome with NkapTalk installed.

To test the "error" cases:

| Try this | You get |
|---|---|
| Amount `0` then Continue | `AMOUNT_001` amount must be greater than zero |
| Amount `900000` then Continue | `AMOUNT_002` insufficient balance |
| Continue on the beneficiary page without ticking the box | `SECURITY_001` security warning |
| Confirm on the summary without ticking the box | `CONFIRM_001` |

## 6. Safety and integrity

These rules are written in code. They don't depend on the AI behaving well.

- **Locked values.** Every amount, fee, total, percentage, phone number, reference, account number, error code, date and name you typed is detected and replaced by a placeholder before translation, then put back and compared. If anything changed, the original text is shown instead. The yellow bar in the panel shows the live count, e.g. *"🔒 19 values locked in 29 translated texts · 0 changed"*. Click **Check** to re-verify the whole page.
- **Ask before money moves.** NkapTalk never presses *Confirm* without first reading back the values **from the screen** and getting a clear "yes". "No" cancels.
- **Confirmation boxes** ("I have verified…", "I confirm…") are only ticked after your "yes".
- **No PINs or passwords.** NkapTalk refuses to fill password, PIN, OTP or code fields.
- **Unclear amounts are asked again.** Spoken amounts are produced by code, not by the AI: "5 100 FCFA" → *"five thousand, one hundred franc"*, phone numbers digit by digit, references letter by letter.
- **Warnings are never softened.** Known warnings use reviewed Pidgin. An unknown warning gets a Pidgin warning prefix **plus the exact original words**.
- **Banking only.** Off-topic questions get a polite fixed answer.

## 7. Privacy: what leaves your computer

The test rules say an extension must not collect, store or transmit the data displayed on the page.

| Feature | Sent | To |
|---|---|---|
| Page translation (phrasebook) | Nothing | — |
| Typed requests, local mode | Nothing | — |
| Microphone, local mode | Your voice only | Google, through Chrome's speech recognition |
| Gemini voice understanding | Your voice or typed words + NkapTalk's last question. **Never the screen.** | Google Gemini API |
| Gemini translation of new text | Only unknown text, with **every value replaced by ⟦1⟧, ⟦2⟧…** | Google Gemini API |
| Gemini translation into a local language | The page's interface text, with **every value replaced by ⟦1⟧, ⟦2⟧…** (greeting names too) | Google Gemini API |
| Gemini voice (off by default) | The reply text, which contains values | Google Gemini API |

NkapTalk stores no page data. The only things saved are your settings, native-speaker corrections, and local-language translations of interface text with the values already removed. Names you type are kept in memory only (to protect them from translation) and disappear when the page closes. There are no analytics and no NkapTalk server.

## 8. How it works

```
          Bank page (unchanged)
     reads ▲            │ clicks / fills, like a person
           │            ▼
 ┌──────────────── NkapTalk extension (in the browser) ─────────────────┐
 │ values.js      find & lock amounts, phones, refs, codes, accounts,   │
 │                dates, names                                          │
 │ phrasebook.js  French/English → Pidgin (offline, reviewed)           │
 │ translator.js  translate in place, watch for new text, verify values │
 │ screen.js      find buttons, fields and values by their text         │
 │ nlu.js         understand Pidgin (offline rules, or Gemini)          │
 │ assistant.js   the conversation + guided transfer + safety rules     │
 │ speech.js      values → spoken words, voice out, microphone          │
 │ ui.js          floating button & panel (Shadow DOM, no style leaks)  │
 └──────────────────────────────┬───────────────────────────────────────┘
                                │ optional, masked
                        background.js ──► Google Gemini API
```

### Project layout

```
nkap-talk/
├── nkaptalk-extension/     ← load this folder in Chrome
│   ├── manifest.json
│   ├── background.js       only file that calls Gemini
│   ├── content/            everything that runs on the bank page
│   ├── options/            settings page
│   └── icons/
├── practice-bank/          offline copy of the SAFINUM test page
├── tests/                  unit tests + end-to-end test in Chrome
├── PIDGIN-REVIEW.md        every Pidgin line, for native-speaker review
└── README.md
```

## 9. Run the tests

```bash
# Unit tests (Node.js 18+)
node tests/test-phrasebook.js   # all 134 test-page strings (FR + EN) translated, 0 values changed
node tests/test-nlu.js          # 35 Pidgin requests, answers, and value-to-speech checks
node tests/test-localize.js     # local languages: Gemini output refused if any value is off; corrections

# End-to-end: loads the real extension in Chrome and runs the full journey on the practice page
pip install playwright
python3 tests/e2e.py
python3 tests/e2e-local.py      # page in Ewondo, voice in Pidgin, with a fake Gemini that tries to change values
```

The end-to-end test covers: dashboard, balance, off-topic refusal, fees, beneficiary, read-back, "no" cancels, confirm, receipt, insufficient-balance error, jury-injected messages, the English page, and the Pidgin/original toggle. All pass, with 0 values changed.

## 10. Improve the Pidgin

The Pidgin was written as a starting point and **must be checked by native speakers**.

1. Open **[PIDGIN-REVIEW.md](PIDGIN-REVIEW.md)**: every screen text, every sentence NkapTalk says, and the ways people ask.
2. Mark each line OK, or write a better version.
3. Apply fixes in `nkaptalk-extension/content/phrasebook.js` (screen text) and `nkaptalk-extension/content/assistant.js` (what NkapTalk says).
4. Add new ways of asking to `tests/test-nlu.js` and patterns to `nkaptalk-extension/content/nlu.js`.
5. Run the tests, reload the extension.

Keep `{1}`, `{2}`... exactly as they are in the phrasebook: they stand for amounts, names or numbers taken from the page.

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| The NkapTalk button doesn't appear | Check the address is `https://safinum.cm/hackathon-test…` or `http://localhost…`. Reload the page. In `chrome://extensions`, check NkapTalk is on. |
| The page isn't in Pidgin | Press **Alt + Shift + T**, or click **Page: Original** in the panel. Check *Translate the page as soon as it opens* in settings. |
| The mic does nothing | Allow the microphone for the site (🔒 icon left of the address bar → Microphone → Allow). Or type instead. |
| "I no hear you well" | Speak a bit closer to the mic, or add a Gemini key for better understanding of accents. |
| The voice sounds very English | Pick another voice in settings (*Browser voice*), or turn on Gemini's voice (see privacy note). |
| Want it on another website | Add the site's address under `"matches"` in `nkaptalk-extension/manifest.json`, then reload the extension. |

## 12. Known limitations

- Local-language translations come from Gemini and must be checked by native speakers before real use. Use the corrections box in the settings.
- Names are locked when NkapTalk can tell they are names (typed in a field, greeting patterns, two capitalised words). A lone first name inside a sentence it doesn't know could still be sent for translation.
- The Pidgin still needs review by native speakers (see [Improve the Pidgin](#10-improve-the-pidgin)).
- Voice output uses an English voice reading Pidgin spelling. Recorded native voice clips would be the next step.
- Offline understanding is rule-based and covers common phrasings, not every way of speaking. Gemini mode handles free speech.
- Local money slang for amounts isn't built in yet: NkapTalk asks again rather than guessing.
- Desktop Chrome only. The same engine can later power an Android app working over mobile money apps.
- The guided transfer follows the 5 steps of the SAFINUM test page. On other pages NkapTalk translates and reads the screen, but doesn't drive the flow.

## 13. Components used

| Component | Used for |
|---|---|
| Chrome Extensions API (Manifest V3) | Running on the page, settings |
| Web Speech API (built into Chrome) | Voice output; voice input in local mode |
| Google Gemini API: `gemini-2.5-flash`, optional `gemini-2.5-flash-preview-tts` | Understanding speech, translating new text (masked), optional voice |
| Our own code | Value locking, Pidgin phrasebook, screen reading, conversation, safety rules |

No third-party libraries are bundled in the extension. The end-to-end test uses [Playwright](https://playwright.dev).

---

<div align="center">

Made in Bamenda, Cameroon, by **Serge Ntunyu Ngala (NSN)** and team, for the **SAFINUM Innovate Challenge 2026**.

</div>
