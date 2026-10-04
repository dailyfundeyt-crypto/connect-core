/*
 * Connect Shell – Sidebar-Logik (geteilt von Helium-Extension, WebView2 und normaler Webseite)
 *
 * Oben: Modus-Leiste wie Connect (apps/app company-switcher.tsx + company-level-chips.tsx,
 * WPF MainWindow.xaml): Logo/Home · Focus(1) · Messages(2) · Browser(3) · Unternehmen(4).
 * Ein Klick schaltet die Ansicht der Sidebar um UND öffnet die passende Connect-Route im
 * Connect-Tab (localhost:3101). Der Modus wird in Connect über localStorage
 * "connect.activeLevel" + Route /company/<id>?level=N gesetzt (wie in der Web-App).
 *
 * Klick-Routing:
 *   "helium"   (chrome.tabs vorhanden, läuft als Side-Panel der Extension)
 *              -> vorhandenen Tab mit gleicher Seite aktivieren, sonst aktiven Tab umleiten
 *                 (angeheftete Tabs wie Connect werden nie überschrieben -> neuer Tab),
 *                 Strg/Mittelklick -> neuer Tab. Connect-Routen laufen immer im Connect-Tab.
 *   "webview2" (window.chrome.webview vorhanden, z. B. in Connect Desktop)
 *   "web"      (sonst)
 *              -> Connect-Desktop-Bridge: GET /api/browser/tabs, POST /switchtab {tabId},
 *                 POST /navigate {url} bzw. /newtab {url} auf http://127.0.0.1:3002
 *              -> ist die Bridge nicht erreichbar: webview2 => postMessage an Host,
 *                 web => window.open(url)
 */
(() => {
  "use strict";
  const cfg = self.CONNECT_SHELL_CONFIG;
  if (!cfg) { document.body.textContent = "tabs.config.js fehlt."; return; }

  const $ = (id) => document.getElementById(id);
  const hasChromeTabs = typeof chrome !== "undefined" && !!(chrome.tabs && chrome.tabs.query && chrome.runtime && chrome.runtime.id);
  const hasScripting = hasChromeTabs && !!(chrome.scripting && chrome.scripting.executeScript);
  const hasWebView = !!(window.chrome && window.chrome.webview);
  const ENV = hasChromeTabs ? "helium" : hasWebView ? "webview2" : "web";
  const BRIDGE = (cfg.bridgeUrl || "http://127.0.0.1:3002").replace(/\/$/, "") + "/api/browser";
  const CONNECT = (cfg.connectUrl || cfg.startUrl || "http://localhost:3101").replace(/\/$/, "");
  const SPACE_KEY = "connectShell.activeSpace";
  const MODE_KEY = "connectShell.activeMode";
  const COLLAPSE_KEY = "connectShell.collapsed";

  const tabs = (cfg.tabs || []).filter((t) => t && t.id && t.url);
  const spaces = cfg.spaces || [];
  const modes = (cfg.modes || []).filter((m) => m && m.id);
  const companies = cfg.companies || [];
  let activeSpace = localStorage.getItem(SPACE_KEY) || (spaces[0] && spaces[0].id) || null;
  let activeMode = localStorage.getItem(MODE_KEY) || "home";
  if (!modes.some((m) => m.id === activeMode)) activeMode = modes[0] ? modes[0].id : "home";
  let activeTabId = null;
  let query = "";
  // Zuletzt aus dem Connect-Tab gelesener Zustand (activeCompanyId / activeLevel)
  let connectState = { companyId: null, level: null };

  // ---------- Helfer ----------
  const parse = (u) => { try { return new URL(u); } catch { return null; } };
  const normHost = (h) => (h === "127.0.0.1" ? "localhost" : h).replace(/^www\./, "");
  /** true, wenn `current` zur Konfig-URL `target` gehört (gleicher Host/Port, Pfad-Präfix). */
  function sameTarget(current, target) {
    const a = parse(current), b = parse(target);
    if (!a || !b) return false;
    if (normHost(a.hostname) !== normHost(b.hostname) || a.port !== b.port) return false;
    const bp = b.pathname.replace(/\/$/, "");
    return bp === "" || a.pathname === bp || a.pathname.startsWith(bp + "/");
  }
  const isConnectUrl = (u) => sameTarget(u || "", CONNECT + "/");
  /** Bestpassender Konfig-Tab für eine URL (längstes Pfad-Präfix gewinnt). */
  function matchConfigTab(url) {
    let best = null, bestLen = -1;
    for (const t of tabs) {
      if (!sameTarget(url, t.url)) continue;
      const len = (parse(t.url)?.pathname || "").length;
      if (len > bestLen) { best = t; bestLen = len; }
    }
    return best;
  }
  function monogram(title, color) {
    const letter = (title || "?").trim().charAt(0).toUpperCase() || "?";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
      `<rect width="24" height="24" rx="6" fill="${color || "#475569"}"/>` +
      `<text x="12" y="16.5" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700" fill="#fff">${letter}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function iconEl(t) {
    const wrap = document.createElement("span");
    wrap.className = "tab__icon" + (t.icon ? "" : " tab__icon--mono");
    wrap.style.setProperty("--tile", t.color || "#475569");
    const img = document.createElement("img");
    img.alt = "";
    img.src = t.icon || monogram(t.title, t.color);
    img.onerror = () => { wrap.classList.add("tab__icon--mono"); img.src = monogram(t.title, t.color); };
    wrap.appendChild(img);
    return wrap;
  }
  function maskIcon(src, small) {
    const s = document.createElement("span");
    s.className = "ico" + (small ? " ico--sm" : "");
    s.style.setProperty("--ico", `url(${src})`);
    return s;
  }
  function softIcon(src) {
    const wrap = document.createElement("span");
    wrap.className = "tab__icon tab__icon--soft";
    wrap.appendChild(maskIcon(src || "icons/house.svg", true));
    return wrap;
  }
  const matches = (...fields) => !query || fields.some((f) => (f || "").toLowerCase().includes(query));
  let toastTimer = 0;
  function toast(msg) {
    const el = $("toast"); el.textContent = msg || "";
    clearTimeout(toastTimer); if (msg) toastTimer = setTimeout(() => (el.textContent = ""), 4000);
  }

  // ---------- Connect-Routen ----------
  const companyId = () => connectState.companyId || cfg.defaultCompanyId || (companies[0] && companies[0].id) || "nordwind";
  /** URL für einen Connect-Modus – gleiche Ziele wie CompanyLevelChips in apps/app. */
  function levelUrl(level, cid) {
    if (!level || level === 2) return CONNECT + "/";
    return `${CONNECT}/company/${encodeURIComponent(cid || companyId())}?level=${level}`;
  }
  const modeById = (id) => modes.find((m) => m.id === id);
  const modeByLevel = (lvl) => modes.find((m) => m.level === lvl);

  // ---------- Rendering ----------
  function renderRail() {
    const root = $("rail-modes"); root.replaceChildren();
    for (const m of modes) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "rail__btn" + (m.id === activeMode ? " is-active" : "");
      b.dataset.mode = m.id; b.title = m.title; b.setAttribute("aria-label", m.title);
      if (m.id === activeMode) b.setAttribute("aria-current", "page");
      if (m.icon === "logo") {
        const img = document.createElement("img");
        img.className = "rail__logo"; img.alt = "Connect"; img.src = "icons/connect-logo.png";
        img.onerror = () => img.replaceWith(Object.assign(document.createElement("span"), { className: "rail__logo--fallback", textContent: "C" }));
        b.appendChild(img);
      } else {
        b.appendChild(maskIcon(m.icon));
      }
      root.appendChild(b);
    }
    const collapsed = $("shell").classList.contains("is-collapsed");
    $("rail-collapse").title = collapsed ? "Sidebar ausklappen" : "Sidebar verkleinern";
  }

  function linkButton(l) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab";
    if (l.level) b.dataset.level = String(l.level);
    if (l.path) b.dataset.path = l.path;
    if (l.company) b.dataset.company = l.company;
    b.title = l.path ? CONNECT + l.path : l.title;
    b.append(softIcon(l.icon), Object.assign(document.createElement("span"), { className: "tab__label", textContent: l.title }));
    return b;
  }

  function render() {
    renderRail();
    const mode = modeById(activeMode) || { id: "home" };
    const showTabs = mode.id === "home" || mode.id === "browser";
    const list = $("tabs"); list.replaceChildren();

    $("view-title").textContent = mode.id === "home" ? "" : (mode.title || "").split(" – ")[0];
    $("view-title").hidden = mode.id === "home";

    // Angeheftet nur in Home
    const pinned = mode.id === "home" ? tabs.filter((t) => t.pinned && matches(t.title, t.url)) : [];
    const pinRoot = $("pinned"); pinRoot.replaceChildren();
    for (const t of pinned) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "pin"; b.dataset.id = t.id; b.title = t.url;
      b.append(iconEl(t), Object.assign(document.createElement("span"), { textContent: t.title }));
      pinRoot.appendChild(b);
    }
    pinRoot.hidden = pinned.length === 0;

    // Connect-Links des Modus
    const links = ((cfg.modeLinks || {})[mode.id] || []).filter((l) => matches(l.title, l.path));
    for (const l of links) list.appendChild(linkButton(l));

    // Unternehmen: Company-Liste (wie Company-Switcher)
    if (mode.id === "company") {
      const cur = companyId();
      list.appendChild(Object.assign(document.createElement("div"), { className: "group-label", textContent: "Companies" }));
      for (const c of companies.filter((c) => matches(c.name, c.id))) {
        const b = linkButton({ title: c.name, company: c.id, icon: "icons/building-2.svg" });
        b.classList.toggle("is-active", c.id === cur);
        list.appendChild(b);
      }
      for (const l of [
        { title: "Company-Profil", path: `/company/${encodeURIComponent(cur)}?level=2&profile=true`, icon: "icons/building-2.svg" },
        { title: "Neue Company", path: "/company/new", icon: "icons/plus.svg" },
        { title: "Companies verwalten", path: "/settings#companies", icon: "icons/app-window.svg" },
      ].filter((l) => matches(l.title, l.path))) list.appendChild(linkButton(l));
    }

    // Tabs des aktiven Space (Home + Browser)
    const sp = spaces.find((s) => s.id === activeSpace);
    const st = $("space-title");
    st.textContent = sp ? sp.name : "";
    st.style.setProperty("--space-color", sp ? sp.color : "");
    st.hidden = !sp || !showTabs;
    if (showTabs) {
      for (const t of tabs.filter((t) => !t.pinned && (!spaces.length || t.space === activeSpace) && matches(t.title, t.url))) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "tab"; b.dataset.id = t.id; b.title = t.url;
        b.append(iconEl(t), Object.assign(document.createElement("span"), { className: "tab__label", textContent: t.title }));
        if (t.placeholder) b.appendChild(Object.assign(document.createElement("span"), { className: "tab__hint", textContent: "Platzhalter" }));
        list.appendChild(b);
      }
    }
    if (!list.children.length && pinned.length === 0) {
      list.appendChild(Object.assign(document.createElement("p"), { className: "empty", textContent: query ? `Nichts gefunden für „${query}“.` : "Keine Einträge." }));
    }

    const spRoot = $("spaces"); spRoot.replaceChildren();
    for (const s of spaces) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "space" + (s.id === activeSpace ? " is-active" : "");
      b.dataset.space = s.id; b.title = s.name; b.style.setProperty("--space-color", s.color);
      spRoot.appendChild(b);
    }
    spRoot.hidden = spaces.length === 0 || !showTabs;
    markActive(activeTabId);
  }
  function markActive(id) {
    activeTabId = id;
    document.querySelectorAll(".tab[data-id], .pin[data-id]").forEach((el) =>
      el.classList.toggle("is-active", el.dataset.id === id));
  }
  function setMode(id, { persist = true } = {}) {
    if (!modeById(id) || id === activeMode) { renderRail(); return; }
    activeMode = id;
    if (persist) localStorage.setItem(MODE_KEY, id);
    render();
  }

  // ---------- Klick-Routing: Helium / Chromium-Extension ----------
  /** Liest/setzt Connect-localStorage im Connect-Tab (braucht "scripting" + host_permissions). */
  async function inConnectTab(tabId, level, cid) {
    if (!hasScripting) return null;
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        args: [level || null, cid || null],
        func: (lvl, company) => {
          try {
            if (company) {
              localStorage.setItem("connect.activeCompanyId", company);
              window.dispatchEvent(new Event("connect-active-company"));
            }
            if (lvl) {
              localStorage.setItem("connect.activeLevel", String(lvl));
              window.dispatchEvent(new Event("connect-active-level"));
            }
            return { companyId: localStorage.getItem("connect.activeCompanyId"), level: Number(localStorage.getItem("connect.activeLevel")) || 2 };
          } catch (e) { return null; }
        },
      });
      return res && res.result ? res.result : null;
    } catch { return null; }
  }
  const W = self.ConnectShellWindows;
  const heliumRouter = {
    /** Links/Apps: immer eigenes normales Helium-Fenster (vorhandenes wird fokussiert); Connect-URLs ins Connect-App-Fenster. */
    async open(t, newTab) {
      if (isConnectUrl(t.url)) { await W.openConnect(t.url); return; }
      await W.openWindow(t.url, { forceNew: !!newTab });
    },
    /** Connect-Route im Connect-App-Fenster (ohne Adressleiste) öffnen; fehlt es, wird es erzeugt. */
    async openConnect(url, { level, company } = {}) {
      const found = await W.findConnectTab();
      if (found) {
        const st = await inConnectTab(found.tab.id, level, company);
        if (st) connectState = st;
      }
      await W.openConnect(url);
    },
    async newTab() { await W.openConnect(cfg.startUrl); },
    watch() {
      const sync = async () => {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const url = active ? active.url || active.pendingUrl || "" : "";
        const m = active && matchConfigTab(url);
        if (m && !m.pinned && m.space && m.space !== activeSpace && spaces.length) { activeSpace = m.space; localStorage.setItem(SPACE_KEY, activeSpace); render(); }
        markActive(m ? m.id : null);
        // Modus der Connect-Web-App (App-Fenster) in der Leiste spiegeln
        const found = await W.findConnectTab();
        if (found && found.tab.status === "complete") {
          const curl = found.tab.url || "";
          const st = await inConnectTab(found.tab.id);
          if (st) {
            const companyChanged = st.companyId !== connectState.companyId;
            connectState = st;
            const lvlFromUrl = Number(parse(curl)?.searchParams.get("level")) || null;
            const lvl = lvlFromUrl && /\/company\//.test(curl) ? lvlFromUrl : st.level;
            if (!(activeMode === "home" && lvl === 2)) {
              const mm = modeByLevel(lvl);
              if (mm && mm.id !== activeMode) { setMode(mm.id); return; }
            }
            if (companyChanged && activeMode === "company") render();
          }
        }
      };
      chrome.tabs.onActivated.addListener(sync);
      chrome.windows.onFocusChanged.addListener(() => sync());
      chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.status === "complete") sync(); });
      sync();
    },
  };

  // ---------- Klick-Routing: Connect Desktop (WebView2) / normale Seite ----------
  async function bridge(path, body) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(BRIDGE + path, body === undefined
        ? { signal: ctrl.signal }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }
  const bridgeRouter = {
    async open(t, newTab) {
      try {
        const list = await bridge("/tabs");
        const existing = (list.tabs || []).find((x) => sameTarget(x.url || "", t.url));
        if (existing && !newTab) { await bridge("/switchtab", { tabId: existing.id }); return; }
        const activeCfg = matchConfigTab(((list.tabs || []).find((x) => x.active) || {}).url || "");
        const wantNew = newTab || cfg.openMode === "new" || (activeCfg && activeCfg.pinned);
        await bridge(wantNew ? "/newtab" : "/navigate", { url: t.url });
      } catch (err) {
        if (hasWebView) {
          // Fallback: Host-Nachricht. ACHTUNG: MainWindow.WebApp_MessageReceived kennt diesen Typ noch nicht (nicht verifiziert).
          window.chrome.webview.postMessage(JSON.stringify({ type: "connect-shell-navigate", url: t.url, newTab: !!newTab }));
          toast("Bridge :3002 nicht erreichbar – an WebView2-Host gesendet.");
        } else {
          window.open(t.url, "_blank", "noopener");
          toast("Bridge :3002 nicht erreichbar – in neuem Fenster geöffnet.");
        }
      }
    },
    async openConnect(url, { newTab } = {}) {
      try {
        const list = await bridge("/tabs");
        const tab = (list.tabs || []).find((x) => x.active && isConnectUrl(x.url)) || (list.tabs || []).find((x) => isConnectUrl(x.url));
        if (tab && !newTab) { await bridge("/switchtab", { tabId: tab.id }); await bridge("/navigate", { url }); return; }
        await bridge("/newtab", { url });
      } catch { await this.open({ url }, !!newTab); }
    },
    async newTab() { await this.open({ url: cfg.startUrl }, true); },
    watch() {
      const sync = async () => {
        try {
          const list = await bridge("/tabs");
          const act = (list.tabs || []).find((x) => x.active);
          const m = act && matchConfigTab(act.url || "");
          markActive(m ? m.id : null);
        } catch { /* Bridge offline: Markierung bleibt beim letzten Klick */ }
      };
      sync(); setInterval(sync, 3000);
    },
  };

  const router = ENV === "helium" ? heliumRouter : bridgeRouter;
  const fail = (err) => toast(String((err && err.message) || err));

  // ---------- Erstellen-Menü ("+", wie Connect: New company / group / bot / Market) ----------
  const CREATE_ITEMS = [
    { title: "Neue Company", path: "/company/new", icon: "icons/building-2.svg" },
    { title: "Neue Gruppe", path: "/", icon: "icons/messages-square.svg", hint: "In Connect: + → New group" },
    { title: "Neuer Bot", path: "/agents?new=true", icon: "icons/zap.svg" },
    { title: "Market", path: "/market", icon: "icons/app-window.svg" },
    { title: "Neuer Tab", newTab: true, icon: "icons/plus.svg" },
  ];
  function toggleCreateMenu(force) {
    const menu = $("create-menu");
    const open = force !== undefined ? force : menu.hidden;
    if (open && !menu.children.length) {
      CREATE_ITEMS.forEach((it, i) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "menu__item"; b.dataset.create = String(i); b.setAttribute("role", "menuitem");
        b.append(maskIcon(it.icon, true), document.createTextNode(it.title));
        menu.appendChild(b);
      });
    }
    menu.hidden = !open;
  }

  // ---------- Events ----------
  document.addEventListener("click", (e) => onActivate(e, false));
  document.addEventListener("auxclick", (e) => { if (e.button === 1) onActivate(e, true); });
  function onActivate(e, forceNew) {
    const newTab = forceNew || e.ctrlKey || e.metaKey;
    const createItem = e.target.closest("[data-create]");
    if (createItem) {
      toggleCreateMenu(false);
      const it = CREATE_ITEMS[Number(createItem.dataset.create)];
      if (it.newTab) { router.newTab().catch(fail); return; }
      if (it.hint) toast(it.hint);
      router.openConnect(CONNECT + it.path, { newTab }).catch(fail);
      return;
    }
    if (e.target.closest("#create")) { toggleCreateMenu(); return; }
    if (!e.target.closest("#create-menu")) toggleCreateMenu(false);

    if (e.target.closest("#rail-collapse")) {
      const on = !$("shell").classList.contains("is-collapsed");
      $("shell").classList.toggle("is-collapsed", on);
      localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0");
      renderRail();
      return;
    }
    const modeBtn = e.target.closest("[data-mode]");
    if (modeBtn) {
      const m = modeById(modeBtn.dataset.mode);
      if (!m) return;
      setMode(m.id);
      const url = m.level ? levelUrl(m.level) : CONNECT + "/";
      router.openConnect(url, { level: m.level, newTab }).catch(fail);
      return;
    }
    const companyBtn = e.target.closest("[data-company]");
    if (companyBtn) {
      const cid = companyBtn.dataset.company;
      connectState = { ...connectState, companyId: cid };
      render();
      router.openConnect(levelUrl(4, cid), { level: 4, company: cid, newTab }).catch(fail);
      return;
    }
    const linkBtn = e.target.closest("[data-level], [data-path]");
    if (linkBtn && !linkBtn.dataset.id) {
      const lvl = Number(linkBtn.dataset.level) || undefined;
      const url = linkBtn.dataset.path ? CONNECT + linkBtn.dataset.path : levelUrl(lvl);
      router.openConnect(url, { level: lvl, newTab }).catch(fail);
      return;
    }
    const spaceBtn = e.target.closest(".space[data-space]");
    if (spaceBtn) { activeSpace = spaceBtn.dataset.space; localStorage.setItem(SPACE_KEY, activeSpace); render(); return; }
    if (e.target.closest("#new-tab")) { router.newTab().catch(fail); return; }
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    const t = tabs.find((x) => x.id === btn.dataset.id);
    if (!t) return;
    e.preventDefault();
    markActive(t.id);
    router.open(t, newTab).catch(fail);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleCreateMenu(false); });
  $("search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });

  $("env-badge").textContent = ENV;
  $("shell").classList.toggle("is-collapsed", localStorage.getItem(COLLAPSE_KEY) === "1");
  if (!spaces.some((s) => s.id === activeSpace)) activeSpace = spaces[0] ? spaces[0].id : null;
  render();
  router.watch();
})();
