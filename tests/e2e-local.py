"""
End-to-end test for local languages: the page is shown in Ewondo while NkapTalk keeps
talking Pidgin. Gemini is replaced by a fake inside the extension's background worker
(no network, no key), which also tries to break values so we can check they are refused.
"""
import http.server, threading, functools, os, time, tempfile, json, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "nkaptalk-extension")
SITE = os.path.join(ROOT, "practice-bank")

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SITE)
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 8766), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

fails = []
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

# Fake Gemini: local-language prompts get "EWO <text>", except that it tries to cheat on
# the account-number line (writes its own number) and on the fee line (drops a value).
FAKE = r"""
globalThis.__calls = [];
globalThis.gemini = async (model, body) => {
  const prompt = body.contents[0].parts[0].text;
  const line = prompt.split('\n').find((l) => l.startsWith('Input: '));
  const items = JSON.parse(line.slice(7));
  const local = /into Ewondo/.test(prompt);
  __calls.push({ local, items });
  const out = items.map((m) => {
    if (!local) return 'PCM ' + m;
    if (/compte|Account number/i.test(m)) return 'EWO compte 999 999';
    if (/^(Frais|Fees?)\b.*⟦2⟧/i.test(m)) return 'EWO ' + m.replace('⟦2⟧', '');
    return 'EWO ' + m;
  });
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] };
};
"""

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        tempfile.mkdtemp(), executable_path="/usr/bin/google-chrome", headless=False,
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox"],
    )
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker")
    sw.evaluate("() => {" + FAKE + "}")
    sw.evaluate("""() => Promise.all([
      chrome.storage.sync.set({ apiKey: 'test-key', pageLanguage: 'ewo', useGeminiNLU: false }),
      chrome.storage.local.set({ 'fix:ewo': 'Solde disponible => [fix] Mone a ne\\nAvailable balance => [fix] Mone a ne' }),
    ])""")
    for pg in ctx.pages:  # options page opened on install
        if pg.url.startswith("chrome-extension://"): pg.close()

    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.add_init_script("document.documentElement.dataset.nkaptalkMute = '1'")
    page.goto("http://127.0.0.1:8766/index.html")
    page.wait_for_selector("#nkaptalk-root", state="attached", timeout=10000)
    time.sleep(1.5)

    body = lambda: page.evaluate("document.querySelector('#app').textContent.replace(/\\s+/g,' ')")
    t = body()
    check("[fix] Mone a ne" in t, "native-speaker correction shown")
    check("EWO " in t, "Gemini Ewondo text shown")
    check("250 000 FCFA" in t, "balance value unchanged")
    check("CM 001 2345 6789 01" in t, "account number unchanged")
    check("999" not in t, "model's invented number refused")
    check("Account number : CM 001 2345 6789 01" in t, "refused line falls back to Pidgin")
    check("Amina Ngo Bell" in t, "name unchanged")

    calls = sw.evaluate("__calls")
    sent = json.dumps([c["items"] for c in calls], ensure_ascii=False)
    check(any(c["local"] for c in calls), "Ewondo translation requested")
    check("250 000" not in sent and "Amina" not in sent and "CM 001" not in sent and "Amina" not in sent, "no values sent to Gemini")

    def shadow(sel): return page.locator("#nkaptalk-root").locator(sel)
    shadow(".fab").click()
    time.sleep(0.8)
    def last_reply():
        msgs = shadow(".msg.nkaptalk").all_inner_texts()
        return msgs[-1] if msgs else ""
    def talk(text, wait=1.2):
        shadow("input").fill(text); shadow("input").press("Enter"); time.sleep(wait)
        return last_reply()

    greet = last_reply()
    check("account page" in greet and "EWO" not in greet and "[fix]" not in greet, "voice describes the page in Pidgin")
    r = talk("how much moni dey my account")
    check("Moni wey dey your account na 250 000 FCFA" in r, f"balance read in Pidgin: {r}")
    check("Ewondo" in shadow(".tr").inner_text(), "toggle says page is in Ewondo")
    check("voice in Pidgin" in shadow(".mode").inner_text(), "mode line says voice stays Pidgin")

    # a fee line where the fake model drops a value: must not be shown in Ewondo
    page.evaluate("""() => { const d=document.createElement('p'); d.id='feeline'; d.textContent='Frais de 2 % (min. 200 FCFA, max. 5 000 FCFA)'; document.querySelector('#main').prepend(d); }""")
    time.sleep(1.5)
    fee = page.inner_text("#feeline")
    check("200 FCFA" in fee and "5 000 FCFA" in fee and "2 %" in fee, f"fee line keeps all values: {fee}")
    check(not fee.startswith("EWO"), "fee line with dropped value refused")

    shadow(".chk").click(); time.sleep(0.6)
    lock = shadow(".lock .s").inner_text()
    check("0 changed" in lock, f"integrity: {lock}")

    shadow(".tr").click(); time.sleep(0.5)
    check("Solde disponible" in body() or "Available balance" in body(), "original restored on toggle")
    shadow(".tr").click(); time.sleep(0.8)
    check("[fix] Mone a ne" in body(), "Ewondo back on toggle")

    cache = sw.evaluate("chrome.storage.local.get('lt:ewo').then((r) => r['lt:ewo'] || {})")
    check(len(cache) > 0, f"translations saved for offline ({len(cache)})")
    strip = lambda x: re.sub(r"⟦\d+⟧", "", x)
    check(not any(any(ch.isdigit() for ch in strip(k) + strip(v)) for k, v in cache.items()), "saved translations hold no values")
    check(not any("Amina" in k + v for k, v in cache.items()), "saved translations hold no names")
    check(not any("999" in v for v in cache.values()), "refused translation not saved")

    # switch back to Pidgin from settings
    sw.evaluate("chrome.storage.sync.set({ pageLanguage: 'pcm' })")
    time.sleep(1.2)
    t = body()
    check("Moni wey dey your account" in t and "EWO" not in t, "back to Pidgin when setting changes")

    check(not [e for e in errors if "NkapTalk" in e], f"no NkapTalk console errors {errors}")
    ctx.close()

httpd.shutdown()
print(f"\n{len(fails)} failure(s)")
raise SystemExit(1 if fails else 0)
