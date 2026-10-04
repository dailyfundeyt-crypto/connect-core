// Neuer Tab => sofort auf die lokale Connect-App umleiten (MV3 erlaubt kein Inline-Script).
(() => {
  const url = (self.CONNECT_SHELL_CONFIG && self.CONNECT_SHELL_CONFIG.startUrl) || "http://localhost:3010/";
  location.replace(url);
  // Falls der Dev-Server nicht läuft, zeigt Chromium seine Fehlerseite; dieser Text ist nur Fallback.
  addEventListener("DOMContentLoaded", () => {
    const m = document.getElementById("msg");
    if (m) m.innerHTML = 'Connect wird geöffnet … <a href="' + url + '">' + url + "</a>";
  });
})();
