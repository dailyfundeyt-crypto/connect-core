// Content-Script auf Connect (localhost:3101 / Vercel): markiert die Seite und
// leitet open-window / open-split an die Extension weiter. Zusätzlich: Tab-Meta
// inkl. favIconUrl von Helium an Connect posten (Favicon-Pipeline).
(() => {
  const mark = () => {
    const el = document.documentElement;
    if (!el) return;
    el.dataset.connectShell = "1";
    el.dataset.connectShellFeatures = "open-window split tab-meta";
  };
  mark();
  document.addEventListener("DOMContentLoaded", mark, { once: true });

  const reply = (id, payload) =>
    window.postMessage(
      { source: "connect-shell", type: "connect-shell-opened", id, ...payload },
      location.origin,
    );

  const pushTabsToPage = (payload) => {
    window.postMessage(
      { source: "connect-shell", type: "connect-shell-tabs", ...payload },
      location.origin,
    );
  };

  const pushTabMeta = (tab) => {
    if (!tab || typeof tab.url !== "string") return;
    window.postMessage(
      {
        source: "connect-shell",
        type: "connect-shell-tab-meta",
        url: tab.url,
        title: tab.title || "",
        favIconUrl: tab.favIconUrl || tab.favicon || "",
        agentId: tab.agentId,
      },
      location.origin,
    );
  };

  // Connect → Extension
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
    } else if (d.type === "connect-shell-list-tabs") {
      msg = { type: "list-tabs", agentId: d.agentId || null };
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
      .then((r) => {
        reply(d.id, { ok: !!(r && r.ok), mode: r && r.mode, error: r && r.error });
        if (r && r.ok && Array.isArray(r.tabs)) {
          pushTabsToPage({ agentId: d.agentId || null, tabs: r.tabs });
        }
      })
      .catch((e) => reply(d.id, { ok: false, error: String((e && e.message) || e) }));
  });

  // Extension → Content-Script (chrome.runtime.sendMessage / onMessage to tabs)
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "tab-meta") {
        pushTabMeta(msg.tab || msg);
        return;
      }
      if (msg.type === "tabs-snapshot" && Array.isArray(msg.tabs)) {
        pushTabsToPage({ agentId: msg.agentId || null, tabs: msg.tabs });
      }
    });
  } catch {
    /* not in extension context */
  }

  // Beim Laden einmal Tabs anfragen (Favicons für bestehende Tabs).
  try {
    chrome.runtime
      .sendMessage({ type: "list-tabs" })
      .then((r) => {
        if (r && r.ok && Array.isArray(r.tabs)) {
          pushTabsToPage({ tabs: r.tabs });
        }
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
})();
