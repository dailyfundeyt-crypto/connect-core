import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./query-client";
import { router } from "./router";
import "@copilotkit/react-core/v2/styles.css";
import "./styles.css";
// Premium-Look (dunkel, Glas, weiche Bewegung) – siehe styles/premium.css
import "./styles/premium.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Connect could not find the application root element.");
}

// Public-Intro-Div entfernen, sobald React mountet. Wir löschen ihn sofort
// beim Mount, damit der User nicht im Lade-Screen stecken bleibt, falls
// React einen Renderfehler wirft oder die Animation hängt. Ohne diesen
// Hook deckt der `<div id="connect-public-intro">` das ganze Viewport ab
// (`min-height: 100dvh`) und blockiert jeden Klick.
function removePublicIntro() {
  const intro = document.getElementById("connect-public-intro");
  if (intro) intro.remove();
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
    </QueryClientProvider>
  </StrictMode>,
);

// Backup: Public-Intro nach 2s zwangs-entfernen, falls React hängt. Das
// ist defensiv — bei einem normalen Mount wird der Div bereits durch die
// render()-Reaktion entfernt; dieser Timer fängt nur den Fall ab, dass
// React zwar gemountet hat, der Router aber z.B. auf eine Auth-Prüfung
// wartet und noch keinen Inhalt anzeigt.
queueMicrotask(removePublicIntro);
setTimeout(removePublicIntro, 2000);

void import("@/lib/companies/workspace-sync").then((m) => {
  void m.hydrateConnectWorkspace();
});

void import("@/lib/agents/agent-browser-tabs").then((m) => {
  m.startHeliumTabFaviconListener();
});

// Connect Social (helium-social): veröffentlichte Firmen + öffentliche Posts zentral abgleichen.
void import("@/lib/social/sync").then((m) => {
  m.startSocialSync();
});

// API keys live encrypted on the server; localStorage is only the mirror (+ one-time migration).
void import("@/lib/agents/key-vault-sync").then((m) => {
  m.startKeyVaultSync();
});

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is optional — ignore SW failures offline/dev */
    });
  });
}
