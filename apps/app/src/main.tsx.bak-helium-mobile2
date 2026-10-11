import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "./query-client";
import { router } from "./router";
import "@copilotkit/react-core/v2/styles.css";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Connect could not find the application root element.");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ queryClient }} />
    </QueryClientProvider>
  </StrictMode>,
);

void import("@/lib/companies/workspace-sync").then((m) => {
  void m.hydrateConnectWorkspace();
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
