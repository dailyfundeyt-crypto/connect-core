/**
 * Render-Test für „Geplante Aufgaben“ — DOM aus happy-dom, Server per fetch-Attrappe.
 */
import { ensureDom } from "@/test/dom";

ensureDom();

import { afterAll, describe, expect, test } from "bun:test";

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { CloudAgentTasksPanel } = await import("./cloud-agent-tasks");

afterAll(async () => {
  cleanup();
  /*
   * React trägt noch Arbeit nach. Die muss laufen, solange es ein `window` gibt — sonst
   * greift der Scheduler ins Leere, wenn er nach dem Test aufwacht.
   */
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const task = {
  id: "t1",
  agentId: "a1",
  title: "Dusty – Tagesbericht",
  prompt: "Was gibt es Neues?",
  schedule: { kind: "daily", time: "13:00" },
  timezone: "Europe/Berlin",
  enabled: true,
  nextRunAt: "2026-10-29T12:00:00.000Z",
  lastRunAt: "2026-10-28T12:00:05.000Z",
  lastStatus: "answered",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-28T12:00:05.000Z",
};

describe("CloudAgentTasksPanel", () => {
  test("lists tasks with next run and status; run now, delete confirm, create validation", async () => {
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      const body =
        method === "GET"
          ? { tasks: [task] }
          : { task: { ...task, lastStatus: "sending" } };
      return new Response(JSON.stringify(body), {
        status: method === "POST" ? 202 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CloudAgentTasksPanel agentId="a1" />
      </QueryClientProvider>,
    );

    await screen.findByText("Dusty – Tagesbericht");
    expect(screen.getByText("Täglich 13:00 Uhr")).toBeTruthy();
    expect(screen.getByText("Nächster Lauf")).toBeTruthy();
    expect(screen.getByText(/13:00$/)).toBeTruthy();
    expect(screen.getByText(/Antwort da/)).toBeTruthy();
    expect(screen.getByRole("switch")).toBeTruthy();
    expect(calls[0]).toEqual({ url: "/api/cloud-agents/a1/tasks", method: "GET" });

    fireEvent.click(screen.getByText("Jetzt ausführen"));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url === "/api/cloud-agents/tasks/t1/run-now")).toBe(true),
    );
    await screen.findByText(/Gesendet – die Antwort erscheint im Chat/);

    fireEvent.click(screen.getAllByText("Löschen")[0] as HTMLElement);
    expect(screen.getByText(/wirklich löschen\?/)).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByText("Abbrechen"));

    fireEvent.click(screen.getByText("Neue Aufgabe"));
    expect(screen.getByLabelText("Titel")).toBeTruthy();
    expect(screen.getByText("Werktags")).toBeTruthy();
    fireEvent.click(screen.getByText("Anlegen"));
    await screen.findByText("Titel fehlt");
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/cloud-agents/a1/tasks")).toBe(false);
  });
});
