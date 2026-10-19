const $ = (id) => document.getElementById(id);
function ago(ms) {
  if (!ms) return "noch nie";
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? `vor ${s} s` : `vor ${Math.round(s / 60)} min`;
}
async function refresh() {
  const res = await chrome.runtime.sendMessage({ type: "status" }).catch(() => null);
  const st = res?.status;
  const ok = st?.state === "verbunden";
  $("pill").classList.toggle("ok", ok);
  $("state").textContent = ok ? "Mit Connect verbunden" : st?.state === "koppeln" ? "Kopple mit Connect …" : "Connect nicht erreichbar";
  $("detail").textContent = ok ? `Befehle ausgeführt: ${st.commands}` : `${st?.detail || ""} · zuletzt verbunden ${ago(st?.lastOk)}`;
  const granted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  $("shots").textContent = granted ? "Screenshots erlaubt ✓" : "Screenshots erlauben";
  $("shots").disabled = granted;
}
$("reconnect").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "reconnect" });
  setTimeout(refresh, 800);
};
$("shots").onclick = async () => {
  await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
  refresh();
};
refresh();
setInterval(refresh, 2000);
