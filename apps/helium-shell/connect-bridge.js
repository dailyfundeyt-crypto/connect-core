// Content-Script auf localhost:3101 (Helium+Connect Web App): markiert die Seite, damit Connect wei\u00df, dass die
// Connect-Shell-Extension da ist, und leitet "App \u00f6ffnen" an die Extension weiter.
// Antwortet mit "connect-shell-opened" (gleiche id), damit Connect sonst auf window.open zur\u00fcckf\u00e4llt.
// Split-Links ("connect-shell-open-split", left + right) -> background.js -> open-window.js openSplit.
(() => {
  // connectShellFeatures: was diese Extension-Version kann (Connect pr\u00fcfen "split" vor dem Split-Link).
  const mark = () => {
    const el = document.documentElement;
    if (!el) return;
    el.dataset.connectShell = "1";
    el.dataset.connectShellFeatures = "open-window split";
  };
  mark();
  document.addEventListener("DOMContentLoaded", mark, { once: true });
  const reply = (id, payload) =>
    window.postMessage({ source: "connect-shell", type: "connect-shell-opened", id, ...payload }, location.origin);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const d = event.data;
    if (!d || d.source !== "connect-app") return;
    const web = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
    let msg = null;
    if (d.type === "connect-shell-open-window" && web(d.url)) {
      msg = { type: "open-window", url: d.url, forceNew: !!d.forceNew };
    } else if (d.type === "connect-shell-open-split" && web(d.left) && web(d.right)) {
      msg = { type: "open-split", left: d.left, right: d.right };
    }
    if (!msg) return;
    let sent;
    try {
      sent = chrome.runtime.sendMessage(msg);
    } catch (e) {
      reply(d.id, { ok: false, error: String((e && e.message) || e) });
      return;
    }
    Promise.resolve(sent)
      .then((r) => reply(d.id, { ok: !!(r && r.ok), mode: r && r.mode, error: r && r.error }))
      .catch((e) => reply(d.id, { ok: false, error: String((e && e.message) || e) }));
  };
})();
