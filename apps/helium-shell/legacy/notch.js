/* notch.js – Floating "Notch" input bar (Bild 3 style)
   - Injected into the page DOM via connect-bridge.js content script
   - Also callable directly from sidebar.js
   - Position persisted in chrome.storage.local
   - Win+C / Ctrl+Shift+C / sidebar button opens it
*/

/* ------------------------------------------------------------------ */
/* Constants                                                              */
/* ------------------------------------------------------------------ */
const NOTCH_ID       = "notch-floating-bar";
const NOTCH_POS_KEY   = "notch.position";
const NOTCH_HIST_KEY  = "notch.history";
const MAX_HISTORY     = 20;
const TIMER_KEY       = "notch.timer";
const TIMER_PRESETS   = [
  { label: "5 min",  minutes: 5,  id: "5min" },
  { label: "10 min", minutes: 10, id: "10min" },
  { label: "25 min", minutes: 25, id: "25min" },
  { label: "Pomodoro 25/5", minutes: 25, id: "pomodoro25", sub: "5 min pause" },
  { label: "Custom", minutes: 0,  id: "custom" },
];
const MOCK_CHATS = {
  "Nordwind": [
    { name: "Man",       time: "12:41",  preview: "Kann ich das so umsetzen?" },
    { name: "SEO-Agent", time: "gestern", preview: "Ranking verbessert sich." },
  ],
  "Delivered": [
    { name: "SEO-Agent", time: "14:02",  preview: "Fertig, Link wurde aktualisiert." },
  ],
};

/* ------------------------------------------------------------------ */
/* Mobile Overlay (Bild 2 style)                                        */
/* ------------------------------------------------------------------ */
const MOBILE_ID = "notch-mobile-overlay";

function openMobileOverlay() {
  injectNotchStyle();
  const existing = document.getElementById(MOBILE_ID);
  if (existing) { existing.remove(); }
  const overlay = buildMobileOverlay();
  document.body.appendChild(overlay);
  return overlay;
}

function closeMobileOverlay() {
  const overlay = document.getElementById(MOBILE_ID);
  if (overlay) overlay.remove();
}

function buildMobileOverlay() {
  const root = document.createElement("div");
  root.id = MOBILE_ID;
  root.className = "notch-mobile-overlay";

  // Topbar
  const topbar = document.createElement("div");
  topbar.className = "notch-overlay-topbar";
  topbar.innerHTML = `
    <div class="notch-overlay-avatar" id="notch-ov-avatar" title="Profile / Companies">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    </div>
    <div class="notch-overlay-topbar-actions">
      <button class="notch-overlay-icon-btn" id="notch-ov-connect" title="Connect öffnen">☰</button>
      <button class="notch-overlay-icon-btn notch-overlay-close" id="notch-ov-close" title="Schließen">×</button>
    </div>
  `;
  root.appendChild(topbar);

  // Body with menu
  const body = document.createElement("div");
  body.className = "notch-overlay-body";
  body.id = "notch-ov-body";
  root.appendChild(body);

  // Wire topbar events
  topbar.querySelector("#notch-ov-close").addEventListener("click", closeMobileOverlay);
  topbar.querySelector("#notch-ov-connect").addEventListener("click", () => {
    closeMobileOverlay();
    dispatchNotchAction("open-connect-notch");
  });
  topbar.querySelector("#notch-ov-avatar").addEventListener("click", () => {
    dispatchNotchAction("open-companies-sheet");
    closeMobileOverlay();
  });

  // Click backdrop to close
  root.addEventListener("click", (e) => { if (e.target === root) closeMobileOverlay(); });

  renderMobileMenu(body);
  return root;
}

function renderMobileMenu(body) {
  body.replaceChildren();
  const items = [
    { id: "nordwind", label: "Nordwind",  color: "#10B981", expandable: true, chats: MOCK_CHATS["Nordwind"] || [] },
    { id: "delivered", label: "Delivered",  color: "#6366F1", expandable: true, chats: MOCK_CHATS["Delivered"] || [] },
    { id: "research",  label: "Research",   color: "#F59E0B", expandable: false },
    { id: "zentrale",  label: "Zentrale",   color: "#8B5CF6", expandable: false },
    { id: "timer",     label: "Timer",      color: "#EF4444", expandable: false },
  ];

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "notch-menu-row";
    row.dataset.menuId = item.id;
    row.innerHTML = `
      <div class="notch-menu-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="${item.color}" stroke="none"><circle cx="12" cy="12" r="10"/></svg>
      </div>
      <span class="notch-menu-text">${escHtml(item.label)}</span>
      ${item.expandable ? '<span class="notch-menu-chevron">›</span>' : ''}
    `;
    body.appendChild(row);

    row.addEventListener("click", () => {
      if (item.id === "timer") {
        toggleTimerPanel(body, row);
        return;
      }
      if (item.expandable) {
        toggleExpandable(body, row, item.id, item.chats);
      } else {
        dispatchNotchAction("nav:" + item.id);
        closeMobileOverlay();
      }
    });
  });
}

function toggleExpandable(body, row, menuId, chats) {
  const panelId = "notch-panel-" + menuId;
  const wasOpen = row.classList.contains("is-expanded");
  // Close all
  body.querySelectorAll(".notch-expanded-panel").forEach(p => p.classList.remove("is-open"));
  body.querySelectorAll(".notch-menu-row.is-expanded").forEach(r => r.classList.remove("is-expanded"));
  if (wasOpen) return;
  let panel = body.querySelector("#" + panelId);
  if (!panel) {
    panel = buildChatPanel(menuId, chats);
    panel.id = panelId;
    body.appendChild(panel);
  }
  row.classList.add("is-expanded");
  requestAnimationFrame(() => panel.classList.add("is-open"));
}

function buildChatPanel(menuId, chats) {
  const panel = document.createElement("div");
  panel.className = "notch-expanded-panel";
  const list = document.createElement("div");
  list.className = "notch-chat-list";
  if (chats.length === 0) {
    const empty = document.createElement("div");
    empty.className = "notch-chat-item";
    empty.style.cssText = "color:rgba(255,255,255,0.3);font-size:12px;cursor:default";
    empty.textContent = "Keine Chats";
    list.appendChild(empty);
  } else {
    chats.forEach((chat) => {
      const item = document.createElement("div");
      item.className = "notch-chat-item";
      item.innerHTML = `
        <span class="notch-chat-name">${escHtml(chat.name)}</span>
        <span class="notch-chat-preview">${escHtml(chat.preview)}</span>
        <span class="notch-chat-time">${escHtml(chat.time)}</span>
      `;
      item.addEventListener("click", () => {
        dispatchNotchAction("open-chat:" + menuId + ":" + chat.name);
        closeMobileOverlay();
      });
      list.appendChild(item);
    });
  }
  panel.appendChild(list);
  return panel;
}

function toggleTimerPanel(body) {
  let panel = body.querySelector("#notch-timer-panel");
  if (!panel) {
    panel = buildTimerPanel();
    panel.id = "notch-timer-panel";
    body.appendChild(panel);
  }
  panel.classList.toggle("is-open");
}

/* ------------------------------------------------------------------ */
/* Timer (standalone state machine)                                       */
/* ------------------------------------------------------------------ */
let _timerState = { running: false, startedAt: null, durationSec: 0, intervalId: null, activePreset: null };

function _loadTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.startedAt && s.durationSec && s.running) {
        const remaining = s.durationSec - (Date.now() - s.startedAt) / 1000;
        if (remaining > 0) {
          _timerState = { running: true, startedAt: s.startedAt, durationSec: s.durationSec,
            intervalId: null, activePreset: s.activePreset };
          _startTick();
          return;
        }
      }
    }
  } catch { /* ignore */ }
  _timerState = { running: false, startedAt: null, durationSec: 0, intervalId: null, activePreset: null };
}

function _saveTimerState() {
  try {
    const { running, startedAt, durationSec, activePreset } = _timerState;
    localStorage.setItem(TIMER_KEY, JSON.stringify({ running, startedAt, durationSec, activePreset }));
  } catch { /* ignore */ }
}

function _startTick() {
  if (_timerState.intervalId) clearInterval(_timerState.intervalId);
  _timerState.intervalId = setInterval(_tickTimer, 500);
}

function _tickTimer() {
  if (!_timerState.running) return;
  const elapsed = (Date.now() - _timerState.startedAt) / 1000;
  const remaining = Math.max(0, _timerState.durationSec - elapsed);
  _saveTimerState();
  _updateTimerDisplay(remaining);
  _updateTimerDot();
  if (remaining <= 0) {
    _timerState.running = false;
    if (_timerState.intervalId) { clearInterval(_timerState.intervalId); _timerState.intervalId = null; }
    _notifyTimerDone();
  }
}

function _notifyTimerDone() {
  _updateTimerDisplay(0);
  const bar = document.getElementById(NOTCH_ID);
  if (bar) {
    const dot = bar.querySelector(".notch-mode-dot");
    if (dot) { dot.style.background = "#EF4444"; dot.style.boxShadow = "0 0 8px #EF4444"; }
    flashToast(bar, "⏰ Timer abgelaufen!");
  }
}

function _updateTimerDisplay(remaining) {
  const mm = Math.floor(remaining / 60);
  const ss = Math.floor(remaining % 60);
  const display = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const bodies = document.querySelectorAll(".notch-timer-panel");
  bodies.forEach(p => {
    const el = p.querySelector(".notch-timer-time");
    if (el) el.textContent = display;
    const startBtn = p.querySelector("[data-action='start']");
    if (startBtn) startBtn.textContent = _timerState.running ? "Pause" : "Start";
    startBtn && startBtn.classList.toggle("is-running", _timerState.running);
  });
}

function _updateTimerDot() {
  const bar = document.getElementById(NOTCH_ID);
  if (!bar) return;
  let dot = bar.querySelector(".notch-timer-dot");
  if (_timerState.running) {
    if (!dot) {
      dot = document.createElement("div");
      dot.className = "notch-timer-dot";
      bar.querySelector(".notch-handle").appendChild(dot);
    }
    dot.style.display = "";
  } else {
    if (dot) dot.style.display = "none";
  }
}

function buildTimerPanel() {
  const panel = document.createElement("div");
  panel.className = "notch-expanded-panel";

  const inner = document.createElement("div");
  inner.className = "notch-timer-panel";

  // Presets
  const presets = document.createElement("div");
  presets.className = "notch-timer-presets";
  TIMER_PRESETS.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "notch-timer-preset";
    btn.textContent = p.label;
    btn.title = p.sub || "";
    if (_timerState.activePreset === p.id) btn.classList.add("is-active");
    btn.addEventListener("click", () => {
      if (p.minutes === 0) {
        flashToast(document.getElementById(MOBILE_ID) || document.getElementById(NOTCH_ID), "Custom: Minuten eingeben…");
        return;
      }
      _setPreset(p);
      presets.querySelectorAll(".notch-timer-preset").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      // Show start
      const startBtn = inner.querySelector("[data-action='start']");
      if (startBtn) { startBtn.textContent = "Start"; startBtn.classList.remove("is-running"); }
    });
    presets.appendChild(btn);
  });
  inner.appendChild(presets);

  // Display
  const display = document.createElement("div");
  display.className = "notch-timer-display";
  const mm = _timerState.durationSec ? Math.floor(_timerState.durationSec / 60) : 0;
  const ss = _timerState.durationSec ? Math.floor(_timerState.durationSec % 60) : 0;
  display.innerHTML = `
    <div class="notch-timer-time">${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}</div>
    <div class="notch-timer-label">${_timerState.activePreset || "Ausgewählt"}</div>
  `;
  inner.appendChild(display);

  // Controls
  const controls = document.createElement("div");
  controls.className = "notch-timer-controls";
  controls.innerHTML = `
    <button class="notch-timer-btn" data-action="reset" title="Zurücksetzen">Reset</button>
    <button class="notch-timer-btn${_timerState.running ? " is-running" : ""}" data-action="start">${_timerState.running ? "Pause" : "Start"}</button>
  `;
  controls.querySelector("[data-action='start']").addEventListener("click", () => {
    if (_timerState.running) { _pauseTimer(); }
    else { _startTimer(); }
  });
  controls.querySelector("[data-action='reset']").addEventListener("click", () => {
    _resetTimer();
    _updateTimerDisplay(_timerState.durationSec);
    _updateTimerDot();
    panel.classList.remove("is-open");
  });
  inner.appendChild(controls);

  panel.appendChild(inner);

  // Restore running state
  _loadTimerState();
  _updateTimerDot();
  _updateTimerDisplay(_timerState.durationSec);

  return panel;
}

function _setPreset(preset) {
  if (_timerState.intervalId) { clearInterval(_timerState.intervalId); _timerState.intervalId = null; }
  _timerState = { running: false, startedAt: null, durationSec: preset.minutes * 60,
    intervalId: null, activePreset: preset.id };
  _saveTimerState();
  _updateTimerDisplay(_timerState.durationSec);
  _updateTimerDot();
}

function _startTimer() {
  if (!_timerState.durationSec) {
    flashToast(document.getElementById(MOBILE_ID) || document.getElementById(NOTCH_ID), "Zuerst Dauer wählen");
    return;
  }
  _timerState.running = true;
  _timerState.startedAt = Date.now() - ((_timerState.durationSec - (_timerState.durationSec % 1)) * 1000);
  _saveTimerState();
  _startTick();
  _updateTimerDot();
  _updateTimerDisplay(_timerState.durationSec);
  // Refresh button text
  const startBtn = document.querySelector("#notch-timer-panel [data-action='start']");
  if (startBtn) { startBtn.textContent = "Pause"; startBtn.classList.add("is-running"); }
}

function _pauseTimer() {
  _timerState.running = false;
  if (_timerState.intervalId) { clearInterval(_timerState.intervalId); _timerState.intervalId = null; }
  _saveTimerState();
  _updateTimerDot();
  _updateTimerDisplay(_timerState.durationSec);
  const startBtn = document.querySelector("#notch-timer-panel [data-action='start']");
  if (startBtn) { startBtn.textContent = "Start"; startBtn.classList.remove("is-running"); }
}

function _resetTimer() {
  _timerState.running = false;
  _timerState.startedAt = null;
  if (_timerState.intervalId) { clearInterval(_timerState.intervalId); _timerState.intervalId = null; }
  _saveTimerState();
  _updateTimerDot();
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ------------------------------------------------------------------ */
/* Mobile Overlay trigger + full UI                                     */
/* ------------------------------------------------------------------ */

/** Robot SVG icon for avatar (inline, no asset needed) */
const ROBOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>`;

function buildMobileOverlay() {
  const root = document.createElement("div");
  root.id = "notch-mobile-overlay";
  root.className = "notch-mobile-overlay";

  root.innerHTML = `
    <header class="notch-overlay-topbar">
      <div class="notch-overlay-avatar" id="overlay-avatar" title="Connect">
        ${ROBOT_SVG}
      </div>
      <div class="notch-overlay-topbar-actions">
        <button class="notch-overlay-icon-btn" id="overlay-search" title="Suchen">&#x1F50D;</button>
        <button class="notch-overlay-icon-btn" id="overlay-plus" title="Erstellen">+</button>
        <button class="notch-overlay-icon-btn notch-overlay-close" id="overlay-close" title="Schließen">&#x2715;</button>
      </div>
    </header>
    <section class="notch-overlay-hero">
      <div class="hero-avatar" id="hero-avatar" title="SEO-Agent">
        ${ROBOT_SVG}
      </div>
      <span class="hero-name">SEO-Agent</span>
      <span class="hero-status">Online</span>
    </section>
    <nav class="notch-overlay-body" id="overlay-menu">
      <div class="notch-menu-row" data-route="nordwind">
        <div class="notch-menu-icon">${ROBOT_SVG}</div>
        <span class="notch-menu-text">Nordwind</span>
        <span class="notch-menu-chevron">&#8250;</span>
      </div>
      <div class="notch-menu-row" data-route="delivered">
        <div class="notch-menu-icon">${ROBOT_SVG}</div>
        <span class="notch-menu-text">Delivered</span>
        <span class="notch-menu-chevron">&#8250;</span>
      </div>
      <div class="notch-menu-row" data-route="research">
        <div class="notch-menu-icon">${ROBOT_SVG}</div>
        <span class="notch-menu-text">Research</span>
        <span class="notch-menu-chevron">&#8250;</span>
      </div>
      <div class="notch-menu-row" data-route="zentrale">
        <div class="notch-menu-icon">${ROBOT_SVG}</div>
        <span class="notch-menu-text">Zentrale</span>
        <span class="notch-menu-chevron">&#8250;</span>
      </div>
      <div class="notch-menu-row" data-route="weitere-bots" data-expand="chat-list">
        <div class="notch-menu-icon">${ROBOT_SVG}</div>
        <span class="notch-menu-text">Weitere Bots</span>
        <span class="notch-menu-chevron">&#9660;</span>
      </div>
      <div class="notch-expanded-panel" id="chat-list-panel">
        <div class="notch-chat-list" id="chat-list">
          <div class="notch-chat-item" data-chat="man">
            <div class="notch-chat-avatar no-star">${ROBOT_SVG}</div>
            <div class="notch-chat-info">
              <div class="notch-chat-name">Man</div>
              <div class="notch-chat-preview">Kann ich das so umsetzen?</div>
            </div>
            <span class="notch-chat-time">16:48</span>
          </div>
          <div class="notch-chat-item" data-chat="seo-agent">
            <div class="notch-chat-avatar has-star">${ROBOT_SVG}</div>
            <div class="notch-chat-info">
              <div class="notch-chat-name">SEO-Agent</div>
              <div class="notch-chat-preview">Ranking verbessert sich.</div>
            </div>
            <span class="notch-chat-time">16:50</span>
          </div>
        </div>
      </div>
      <div class="notch-menu-row" data-route="timer" data-expand="timer-panel">
        <div class="notch-menu-icon">&#x23F1;</div>
        <span class="notch-menu-text">Timer</span>
        <span class="notch-menu-chevron">&#9660;</span>
      </div>
      <div class="notch-expanded-panel" id="timer-panel">
        <div class="notch-timer-panel">
          <div class="notch-timer-display">
            <div class="notch-timer-time" id="timer-display">00:00</div>
            <div class="notch-timer-label">Timer</div>
          </div>
          <div class="notch-timer-presets" id="timer-presets">
            <button class="notch-timer-preset" data-min="5">5 min</button>
            <button class="notch-timer-preset" data-min="10">10 min</button>
            <button class="notch-timer-preset" data-min="25">25 min</button>
            <button class="notch-timer-preset" data-min="0">Custom</button>
          </div>
          <div class="notch-timer-controls">
            <button class="notch-timer-btn" id="timer-start">Start</button>
            <button class="notch-timer-btn is-reset" id="timer-reset">Reset</button>
          </div>
        </div>
      </div>
      <div class="notch-menu-row" data-route="settings" data-expand="settings-panel">
        <div class="notch-menu-icon">&#x2699;</div>
        <span class="notch-menu-text">Einstellungen</span>
        <span class="notch-menu-chevron">&#9660;</span>
      </div>
      <div class="notch-expanded-panel" id="settings-panel">
        <div class="notch-settings-sheet" id="settings-sheet" style="position:static;width:100%;height:auto;">
          <div class="notch-settings-header">
            <button class="notch-overlay-icon-btn notch-overlay-close" id="settings-close">&#x2715;</button>
            <span class="notch-settings-title">Einstellungen</span>
          </div>
          <div class="notch-settings-body">
            <div class="notch-settings-section-title">Agent</div>
            <div class="notch-settings-field">
              <label>Agent-Name</label>
              <input type="text" value="SEO-Agent" placeholder="Agent-Name" />
            </div>
            <div class="notch-settings-section-title">Darstellung</div>
            <div class="notch-settings-field">
              <label>Oberfläche</label>
              <select id="surface-select">
                <option value="mobile">Mobile Overlay</option>
                <option value="floating">Floating Bar</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;

  document.body.appendChild(root);

  // Wire events
  const closeBtn = root.querySelector("#overlay-close");
  closeBtn?.addEventListener("click", closeMobileOverlay);

  const searchBtn = root.querySelector("#overlay-search");
  searchBtn?.addEventListener("click", () => {
    // Route to search in Connect
    dispatchNotchAction("open-search");
  });

  const plusBtn = root.querySelector("#overlay-plus");
  plusBtn?.addEventListener("click", () => {
    // Route to create in Connect
    dispatchNotchAction("open-create");
  });

  // Menu row routing
  root.querySelectorAll(".notch-menu-row[data-route]").forEach(row => {
    row.addEventListener("click", () => {
      const route = row.dataset.route;
      const expand = row.dataset.expand;
      if (expand) {
        // Toggle expand
        const panel = root.querySelector("#" + expand);
        if (panel) {
          const isOpen = panel.classList.contains("is-open");
          panel.classList.toggle("is-open", !isOpen);
          row.classList.toggle("is-expanded", !isOpen);
        }
        return;
      }
      // Route to Connect
      dispatchNotchAction("navigate:" + route);
    });
  });

  // Chat items
  root.querySelectorAll(".notch-chat-item").forEach(item => {
    item.addEventListener("click", () => {
      const chat = item.dataset.chat;
      dispatchNotchAction("open-chat:" + chat);
    });
  });

  // Timer
  let timerSeconds = 0;
  let timerInterval = null;
  const timerDisplay = root.querySelector("#timer-display");
  const timerStartBtn = root.querySelector("#timer-start");
  const timerResetBtn = root.querySelector("#timer-reset");

  function updateTimerDisplay() {
    const m = Math.floor(timerSeconds / 60);
    const s = timerSeconds % 60;
    if (timerDisplay) timerDisplay.textContent =
      String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  timerStartBtn?.addEventListener("click", () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
      if (timerStartBtn) timerStartBtn.textContent = "Start";
    } else {
      if (timerSeconds === 0) timerSeconds = 25 * 60;
      timerInterval = setInterval(() => {
        if (timerSeconds > 0) {
          timerSeconds--;
          updateTimerDisplay();
          if (timerSeconds === 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (timerStartBtn) timerStartBtn.textContent = "Start";
            flashToast(null, "Timer abgelaufen!");
          }
        }
      }, 1000);
      if (timerStartBtn) timerStartBtn.textContent = "Pause";
    }
  });

  timerResetBtn?.addEventListener("click", () => {
    clearInterval(timerInterval);
    timerInterval = null;
    timerSeconds = 0;
    updateTimerDisplay();
    if (timerStartBtn) timerStartBtn.textContent = "Start";
  });

  root.querySelectorAll(".notch-timer-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const mins = parseInt(btn.dataset.min || "0", 10);
      if (mins > 0) {
        timerSeconds = mins * 60;
        updateTimerDisplay();
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
          if (timerStartBtn) timerStartBtn.textContent = "Start";
        }
      }
    });
  });

  // Settings close
  root.querySelector("#settings-close")?.addEventListener("click", () => {
    const panel = root.querySelector("#settings-panel");
    if (panel) {
      panel.classList.remove("is-open");
      root.querySelector("[data-expand='settings-panel']")?.classList.remove("is-expanded");
    }
  });

  // Surface preference
  const surfaceSelect = root.querySelector("#surface-select");
  surfaceSelect?.addEventListener("change", (e) => {
    try { localStorage.setItem("notch.surface", e.target.value); } catch {}
    if (e.target.value === "floating") {
      closeMobileOverlay();
      openNotch();
    }
  });

  // Keyboard: Escape closes overlay
  const escHandler = (e) => {
    if (e.key === "Escape") { closeMobileOverlay(); document.removeEventListener("keydown", escHandler); }
  };
  document.addEventListener("keydown", escHandler);

  return root;
}

function openMobileOverlay() {
  injectNotchStyle();
  let overlay = document.getElementById("notch-mobile-overlay");
  if (!overlay) overlay = buildMobileOverlay();
  overlay.style.display = "";
  overlay.style.zIndex = "" + (Math.max(0, ...Array.from(document.querySelectorAll("*"))
    .filter(el => el !== overlay)
    .map(el => parseInt(window.getComputedStyle(el).zIndex) || 0)) + 1) + "0";
}

function closeMobileOverlay() {
  const overlay = document.getElementById("notch-mobile-overlay");
  if (overlay) overlay.style.display = "none";
}

/** Toggle between mobile overlay and floating bar */
function toggleSurface() {
  const overlay = document.getElementById("notch-mobile-overlay");
  if (overlay && overlay.style.display !== "none") {
    closeMobileOverlay();
  } else {
    // Check preference
    let pref = "mobile";
    try { pref = localStorage.getItem("notch.surface") || "mobile"; } catch {}
    if (pref === "floating") {
      openNotch();
    } else {
      openMobileOverlay();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API (updated)                                                */
/* ------------------------------------------------------------------ */
/** Open surface (mobile overlay or floating bar per preference). */
function openNotch() {
  injectNotchStyle();
  let pref = "mobile";
  try { pref = localStorage.getItem("notch.surface") || "mobile"; } catch {}
  if (pref === "mobile") { openMobileOverlay(); return; }
  let bar = document.getElementById(NOTCH_ID);
  if (!bar) bar = buildNotch();
  bar.style.display = "";
  restorePosition(bar);
  bar.style.zIndex = "" + (Math.max(0, ...Array.from(document.querySelectorAll("*"))
    .filter(el => el !== bar)
    .map(el => parseInt(window.getComputedStyle(el).zIndex) || 0)) + 1) + "0";
  const inp = bar.querySelector(".notch-input");
  if (inp) setTimeout(() => inp.focus(), 30);
  const hint = bar.querySelector(".notch-shortcut-hint");
  if (hint) { hint.classList.add("show"); clearTimeout(hint._hideTimer); hint._hideTimer = setTimeout(() => hint.classList.remove("show"), 4000); }
}

/** Close / hide the floating bar or mobile overlay. */
function closeNotch() {
  const bar = document.getElementById(NOTCH_ID);
  if (bar) {
    const hint = bar.querySelector(".notch-shortcut-hint");
    if (hint) { clearTimeout(hint._hideTimer); hint.classList.remove("show"); }
    bar.style.display = "none";
  }
  closeMobileOverlay();
}

/** Toggle surface (mobile/floating). */
function toggleNotch() {
  let pref = "mobile";
  try { pref = localStorage.getItem("notch.surface") || "mobile"; } catch {}
  if (pref === "mobile") {
    const overlay = document.getElementById("notch-mobile-overlay");
    if (overlay && overlay.style.display !== "none") { closeMobileOverlay(); return; }
    openMobileOverlay();
  } else {
    const bar = document.getElementById(NOTCH_ID);
    if (bar && bar.style.display !== "none") { closeNotch(); return; }
    openNotch();
  }
}

/* ------------------------------------------------------------------ */
/* Build the DOM (floating bar only – mobile overlay is separate)       */
/* ------------------------------------------------------------------ */
function buildNotch() {
  // Remove existing
  const old = document.getElementById(NOTCH_ID);
  if (old) old.remove();

  const bar = document.createElement("div");
  bar.id = NOTCH_ID;
  bar.className = "notch-root";
  bar.setAttribute("role", "complementary");
  bar.setAttribute("aria-label", "Helium Floating Bar");

  // Drag handle
  const handle = document.createElement("div");
  handle.className = "notch-handle";
  handle.title = "Ziehen zum Verschieben";
  handle.innerHTML = `<div class="notch-handle-dots"><span></span><span></span><span></span></div>`;
  bar.appendChild(handle);

  // Input row
  const inputRow = document.createElement("div");
  inputRow.className = "notch-input-row";
  inputRow.innerHTML = `
    <select class="notch-agent-select" title="Agent auswählen">
      <option value="auto" selected>Auto</option>
      <option value="focus">Focus</option>
      <option value="agent">Agent</option>
      <option value="code">Code</option>
    </select>
    <input class="notch-input" type="text"
           placeholder="Aufgabe... @Agent &quot;Auftrag in Anführungszeichen&quot;"
           autocomplete="off" spellcheck="false" aria-label="Eingabe" />
    <button class="notch-icon-btn notch-mic" title="Spracheingabe (noch nicht verfügbar)">🎤</button>
    <button class="notch-icon-btn notch-send" title="Absenden">&#x27A4;</button>
  `;
  bar.appendChild(inputRow);

  // Action row
  const actions = document.createElement("div");
  actions.className = "notch-actions";
  actions.innerHTML = `
    <button class="notch-pill notch-hist-prev" title="Vorheriger Eintrag">&lt;</button>
    <button class="notch-pill notch-hist-next" title="Nächster Eintrag">&gt;</button>
    <button class="notch-pill notch-markieren">💬 Markieren</button>
    <button class="notch-pill notch-markierung" title="Markierung abbrechen">× Markierung</button>
    <button class="notch-pill notch-url">🔗 URL</button>
    <button class="notch-pill notch-aufgabe">✨ Aufgabe</button>
  `;
  bar.appendChild(actions);

  // Bottom chip
  const chip = document.createElement("div");
  chip.className = "notch-task-chip";
  chip.textContent = "✨ Aufgabe";
  bar.appendChild(chip);

  // Toast
  const toast = document.createElement("div");
  toast.className = "notch-toast";
  toast.id = NOTCH_ID + "-toast";
  bar.appendChild(toast);

  // Shortcut hint
  const hint = document.createElement("div");
  hint.className = "notch-shortcut-hint";
  hint.innerHTML = `Tastenkürzel: <kbd>Strg</kbd>+<kbd>Umschalt</kbd>+<kbd>Y</kbd> · <a href="chrome://extensions/shortcuts" target="_blank" tabindex="-1">Umbenennen</a>`;
  bar.appendChild(hint);

  // Status dot
  const dot = document.createElement("div");
  dot.className = "notch-mode-dot";
  bar.appendChild(dot);

  document.body.appendChild(bar);

  // Wire events
  wireNotch(bar);

  return bar;
}

/* ------------------------------------------------------------------ */
/* Event wiring                                                          */
/* ------------------------------------------------------------------ */
function wireNotch(bar) {
  const input    = bar.querySelector(".notch-input");
  const sendBtn  = bar.querySelector(".notch-send");
  const prevBtn  = bar.querySelector(".notch-hist-prev");
  const nextBtn  = bar.querySelector(".notch-hist-next");
  const markBtn  = bar.querySelector(".notch-markieren");
  const markOffBtn = bar.querySelector(".notch-markierung");
  const urlBtn   = bar.querySelector(".notch-url");
  const aufgabeBtn = bar.querySelector(".notch-aufgabe");
  const micBtn   = bar.querySelector(".notch-mic");
  const handle   = bar.querySelector(".notch-handle");

  // --- Drag ---
  let dragging = false, dX = 0, dY = 0;
  handle.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    dX = e.clientX - bar.offsetLeft;
    dY = e.clientY - bar.offsetTop;
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const nx = e.clientX - dX;
    const ny = e.clientY - dY;
    // Clamp to viewport
    const maxX = window.innerWidth - bar.offsetWidth - 4;
    const maxY = window.innerHeight - bar.offsetHeight - 4;
    bar.style.left = Math.max(4, Math.min(maxX, nx)) + "px";
    bar.style.top  = Math.max(4, Math.min(maxY, ny)) + "px";
    bar.style.right = "auto";
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    savePosition(bar);
  });

  // --- History ---
  let history = [];
  let histIdx = -1;
  try { history = JSON.parse(localStorage.getItem(NOTCH_HIST_KEY) || "[]"); } catch {}
  histIdx = history.length; // cursor at end

  function showHist(idx) {
    histIdx = Math.max(0, Math.min(history.length - 1, idx));
    input.value = history[histIdx] || "";
    input.setSelectionRange(input.value.length, input.value.length);
  }
  prevBtn.addEventListener("click", () => { showHist(histIdx - 1); flashToast(bar, histIdx > 0 ? `${histIdx}/${history.length}` : "Anfang"); });
  nextBtn.addEventListener("click", () => { showHist(histIdx + 1); flashToast(bar, histIdx < history.length - 1 ? `${histIdx + 1}/${history.length}` : "Ende"); });

  // --- Send ---
  function doSend() {
    const text = input.value.trim();
    if (!text) return;
    // Save to history
    history = [text, ...history.filter(h => h !== text)].slice(0, MAX_HISTORY);
    histIdx = 0;
    try { localStorage.setItem(NOTCH_HIST_KEY, JSON.stringify(history)); } catch {}
    flashToast(bar, "Gesendet ✓");
    input.value = "";
    // Dispatch task event
    const agent = bar.querySelector(".notch-agent-select").value;
    dispatchNotchTask({ text, agent });
  }
  sendBtn.addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
    if (e.key === "ArrowUp" && history.length) { e.preventDefault(); showHist(histIdx - 1); }
    if (e.key === "ArrowDown" && history.length) { e.preventDefault(); showHist(histIdx + 1); }
    if (e.key === "Escape") { input.blur(); }
  });

  // --- Markieren ---
  let markingMode = false;
  markBtn.addEventListener("click", () => {
    markingMode = true;
    markBtn.classList.add("is-active");
    markOffBtn.classList.remove("is-active");
    flashToast(bar, "Markieren: Bereich wählen…");
    dispatchNotchAction("markieren");
  });
  markOffBtn.addEventListener("click", () => {
    markingMode = false;
    markBtn.classList.remove("is-active");
    markOffBtn.classList.add("is-active");
    dispatchNotchAction("markierung-off");
  });

  // --- URL ---
  urlBtn.addEventListener("click", () => {
    const cur = getCurrentTabUrl();
    if (cur) {
      insertAtCursor(input, cur);
      flashToast(bar, "URL eingefügt");
    } else {
      flashToast(bar, "Keine URL verfügbar");
    }
  });

  // --- Aufgabe ---
  aufgabeBtn.addEventListener("click", () => {
    const text = input.value.trim();
    if (text) {
      const wrapped = `"${text}"`;
      input.value = wrapped;
      input.setSelectionRange(wrapped.length, wrapped.length);
      flashToast(bar, "Als Aufgabe markiert");
    } else {
      insertAtCursor(input, `"Aufgabe..."`);
      flashToast(bar, "Aufgabe-Vorlage eingefügt");
    }
  });

  // --- Mic (placeholder) ---
  micBtn.addEventListener("click", () => flashToast(bar, "Spracheingabe in Arbeit…"));

  // Click outside to close (optional – user may want it to stay)
  // bar.addEventListener("focusout", (e) => { if (!bar.contains(e.relatedTarget)) closeNotch(); });
}

/* ------------------------------------------------------------------ */
/* Dispatch (cross-context communication)                             */
/* ------------------------------------------------------------------ */
/** Sends a task to the background/Connect. */
function dispatchNotchTask({ text, agent }) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage({ type: "notch-submit", text, agent }).catch(() => {});
  }
  // Also dispatch a DOM event for the Connect web app to pick up
  window.dispatchEvent(new CustomEvent("notch-task", { detail: { text, agent }, bubbles: true }));
}

/** Sends an action command to background. */
function dispatchNotchAction(action) {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
    chrome.runtime.sendMessage({ type: "notch-action", action }).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent("notch-action", { detail: { action }, bubbles: true }));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function insertAtCursor(input, text) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.setSelectionRange(start + text.length, start + text.length);
  input.focus();
}

function flashToast(bar, msg) {
  const t = bar && bar.querySelector(".notch-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

/** Gets the current tab URL via chrome.tabs (only works in extension context). */
async function getCurrentTabUrl() {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab && tab.url ? tab.url : null;
  } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* Position persistence                                                  */
/* ------------------------------------------------------------------ */
function savePosition(bar) {
  const pos = { left: bar.style.left, top: bar.style.top };
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.set({ [NOTCH_POS_KEY]: pos }).catch(() => {});
  }
  try { localStorage.setItem(NOTCH_POS_KEY, JSON.stringify(pos)); } catch {}
}

function restorePosition(bar) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const pos = (typeof chrome !== "undefined" && chrome.storage
    ? (() => { /* sync from chrome storage below */ })()
    : null) || tryParse(localStorage.getItem(NOTCH_POS_KEY));

  // Load from chrome.storage async
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(NOTCH_POS_KEY).then((v) => {
      const p = v && v[NOTCH_POS_KEY];
      if (p && p.left && p.top) {
        bar.style.left = p.left;
        bar.style.top  = p.top;
        bar.style.right = "auto";
      } else {
        // Default: bottom-center
        bar.style.left = "50%";
        bar.style.top  = "auto";
        bar.style.bottom = "24px";
        bar.style.right = "auto";
        bar.style.transform = "translateX(-50%)";
      }
    }).catch(() => {
      // Fallback to localStorage
      const p = tryParse(localStorage.getItem(NOTCH_POS_KEY));
      if (p && p.left && p.top) {
        bar.style.left = p.left; bar.style.top = p.top; bar.style.right = "auto";
      } else {
        bar.style.left = "50%"; bar.style.top = "auto"; bar.style.bottom = "24px";
        bar.style.right = "auto"; bar.style.transform = "translateX(-50%)";
      }
    });
    return;
  }

  if (pos && pos.left && pos.top) {
    bar.style.left = pos.left; bar.style.top = pos.top; bar.style.right = "auto";
  } else {
    bar.style.left = "50%"; bar.style.top = "auto"; bar.style.bottom = "24px";
    bar.style.right = "auto"; bar.style.transform = "translateX(-50%)";
  }
}

/* ------------------------------------------------------------------ */
/* CSS injection (once)                                                 */
/* ------------------------------------------------------------------ */
const NOTCH_CSS_INJECTED_KEY = "notch-css-injected";
function injectNotchStyle() {
  if (document.getElementById(NOTCH_CSS_INJECTED_KEY)) return;
  const link = document.createElement("link");
  link.id = NOTCH_CSS_INJECTED_KEY;
  link.rel = "stylesheet";
  // Resolve relative to extension root (content script runs from extension dir)
  const base = chrome && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL("") : "";
  link.href = base + "notch.css";
  (document.head || document.documentElement).appendChild(link);
}

/* ------------------------------------------------------------------ */
/* Keydown fallback for Ctrl+Shift+Y (manifest shortcut) + Win+C         */
/* ------------------------------------------------------------------ */
document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;
  const win   = e.key === "Meta" || e.key === "OS";
  const yKey  = e.key === "y" || e.key === "Y";

  // Ctrl+Shift+Y → open/focus the bar (manifest command also fires)
  if (ctrl && shift && yKey) {
    e.preventDefault();
    openNotch();
    return;
  }

  // Win+C (or Meta+C) → open the bar as fallback
  // NOTE: Windows Copilot intercepts ⊞+C at system level; this listener fires only
  // when the system binding is absent or disabled.
  if (win && (e.key === "c" || e.key === "C")) {
    openNotch();
    // Do NOT preventDefault — let the system binding take precedence if present
  }
}, { capture: true });

/* ------------------------------------------------------------------ */
/* Listen for messages from background (Ctrl+Shift+Y shortcut)          */
/* ------------------------------------------------------------------ */
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "open-floating-bar") {
      openNotch();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Expose globally so sidebar.js and connect-bridge.js can call us         */
/* ------------------------------------------------------------------ */
window.openNotch = openNotch;
window.closeNotch = closeNotch;
window.toggleNotch = toggleNotch;
window.openMobileOverlay = openMobileOverlay;
window.closeMobileOverlay = closeMobileOverlay;
