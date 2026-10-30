/**
 * Render-Test für die Inbox-Ansicht: Freigabekarten (mit und ohne Owner-Key), Tagesgruppen,
 * offene Zählung und das Antwortfeld.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { ensureDom } from "@/test/dom";

/*
 * Bun führt mehrere Testdateien im selben Prozess aus, und `screen` bindet sich beim Import an
 * das Dokument, das zu diesem Zeitpunkt da ist. Deshalb wird hier nichts beim Import
 * gebunden: erst das Fenster aufbauen, dann die Testbibliothek laden — und alle Abfragen
 * laufen über den Container, den das Rendern zurückgibt.
 */
ensureDom();
const React = await import("react");
const Testing = await import("@testing-library/react");
const Query = await import("@tanstack/react-query");
const { ApprovalCard } = await import("./approval-card");
const { InboxView } = await import("./inbox-view");

afterAll(async () => {
  Testing?.cleanup();
  /*
   * React trägt noch Arbeit nach. Die muss laufen, solange es ein `window` gibt — sonst
   * greift der Scheduler ins Leere, wenn er nach dem Test aufwacht.
   */
  await new Promise((resolve) => setTimeout(resolve, 50));
});

const approval = {
  id: "ap-1",
  title: "Mail an Kunde senden?",
  summary: "Der Entwurf liegt bereit.",
  details: "Volltext der Freigabe.",
  status: "pending",
};

/** Rendert etwas und gibt die Abfragen zurück, die auf diesen Baum zeigen. */
function renderWith(children: React.ReactNode) {
  const queryClient = new Query.QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = Testing.render(
    React.createElement(Query.QueryClientProvider, { client: queryClient }, children),
  );
  return { ...result, screen: Testing.within(result.container as HTMLElement) };
}

describe("ApprovalCard", () => {
  test("ohne Owner-Key sind Ja/Nein gesperrt, mit Hinweis", () => {
    const { screen } = renderWith(
      React.createElement(
        "ul",
        null,
        React.createElement(ApprovalCard, {
          approval,
          canDecide: false,
          onDecide: () => undefined,
        }),
      ),
    );
    expect(screen.getByText("Ja")).toHaveProperty("disabled", true);
    expect(screen.getByText("Nein")).toHaveProperty("disabled", true);
    expect(screen.getByText(/Owner-Key fehlt/)).toBeTruthy();
  });

  test("mit Owner-Key entscheidet der Klick", async () => {
    const calls: { decision: string; note?: string }[] = [];
    const { screen } = renderWith(
      React.createElement(
        "ul",
        null,
        React.createElement(ApprovalCard, {
          approval,
          canDecide: true,
          onDecide: (decision: "approved" | "denied", note?: string) => {
            calls.push({ decision, ...(note ? { note } : {}) });
          },
        }),
      ),
    );
    expect(screen.getByText("Ja")).toHaveProperty("disabled", false);
    Testing.fireEvent.click(screen.getByText("Ja"));
    await Testing.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.decision).toBe("approved");
  });

  test("eine entschiedene Freigabe zeigt ihren Status und keine Knöpfe", () => {
    const { screen } = renderWith(
      React.createElement(
        "ul",
        null,
        React.createElement(ApprovalCard, {
          approval: { ...approval, status: "approved" },
          canDecide: true,
          onDecide: () => undefined,
        }),
      ),
    );
    expect(screen.getByText("freigegeben")).toBeTruthy();
    expect(screen.queryByText("Ja")).toBeNull();
  });
});

describe("InboxView", () => {
  test("zeigt „Heute (offen: n)“, die Tagesgruppe und das Antwortfeld", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        ...(init?.body ? { body: String(init.body) } : {}),
      });
      if (url.includes("/inbox/approvals")) {
        return new Response(JSON.stringify({ approvals: [approval] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/inbox/messages")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: "m1",
                text: "Hallo",
                status: "new",
                agent: "muse",
                created_at: "2026-10-29T09:00:00.000Z",
              },
            ],
            open: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { screen } = renderWith(
      React.createElement(InboxView, {
        agentId: "a1",
        hasOwnerKey: false,
        refetchIntervalMs: false,
      }),
    );

    await screen.findByText("Heute (offen: 1)");
    expect(screen.getByText("Hallo")).toBeTruthy();
    expect(screen.getByPlaceholderText("Antwort an Muse …")).toBeTruthy();
    /* Die Freigabekarte erscheint, aber ohne Owner-Key sind die Knöpfe tot. */
    expect(await screen.findByText("Mail an Kunde senden?")).toBeTruthy();
    expect(screen.getByText("Ja")).toHaveProperty("disabled", true);
  });

  test("die Antwort geht über denselben Server-Weg wie der Chat", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? "GET",
        ...(init?.body ? { body: String(init.body) } : {}),
      });
      if (url.includes("/inbox/approvals")) {
        return new Response(JSON.stringify({ approvals: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/inbox/messages") && (init?.method ?? "GET") === "POST") {
        return new Response(JSON.stringify({ message: { id: "m2", status: "sending" } }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/inbox/messages")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: "m1",
                text: "Hallo",
                status: "new",
                agent: "muse",
                created_at: "2026-10-29T09:00:00.000Z",
              },
            ],
            open: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const { screen } = renderWith(
      React.createElement(InboxView, {
        agentId: "a1",
        hasOwnerKey: false,
        refetchIntervalMs: false,
      }),
    );
    const field = await screen.findByPlaceholderText("Antwort an Muse …");
    Testing.fireEvent.change(field, { target: { value: "Ja, mach das" } });
    Testing.fireEvent.click(screen.getByText("Senden"));
    await Testing.waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === "POST" &&
            c.url === "/api/cloud-agents/a1/inbox/messages" &&
            (c.body ?? "").includes("Ja, mach das"),
        ),
      ).toBe(true),
    );
  });
});
