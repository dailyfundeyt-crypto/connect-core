import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RenameNoteDialog, type RenameDialogRequest } from "@/components/brain/rename-note-dialog";

/**
 * Der Weg „+“ → Titel → anlegen und der Weg „Umbenennen“ teilen sich diesen Dialog.
 *
 * Zwei Dinge sind hier festgehalten, weil sie beide schon kaputt waren:
 * 1. Im Anlegen-Modus muss das Titelfeld bedienbar sein. Eine frühere Fassung hatte
 *    `disabled={!note}` – im Anlegen-Modus ist `note` aber genau `null`, also war das Feld
 *    gesperrt und der „Anlegen“-Knopf blieb bei leerem Titel deaktiviert.
 * 2. Der Editor baut sein `request`-Objekt bei jedem Render neu. Der Dialog darf seinen
 *    Effekt deshalb nicht an der Objektidentität aufhängen, sonst springt der getippte Titel
 *    bei jedem Parent-Re-Render (z. B. während des vorherigen Speicherns) auf den alten Wert
 *    zurück und „Umbenennen“ schickt wieder den alten Namen.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(() => cleanup());
afterAll(() => GlobalRegistrator.unregister());

type Sent = { path: string; method: string; body: Record<string, unknown> | null };

const originalFetch = global.fetch;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(sent: Sent[]) {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    sent.push({
      path,
      method: init?.method ?? "GET",
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    if (path.startsWith("/api/brain/notes/preview")) {
      return json({ available: true, linkCount: 0, files: [] });
    }
    if (path === "/api/brain/note") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { path: string };
      return json({ available: true, path: body.path, created: true });
    }
    if (path === "/api/brain/notes/rename") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { path: string; newTitle: string };
      const folder = body.path.includes("/") ? body.path.slice(0, body.path.lastIndexOf("/")) : "";
      return json({
        available: true,
        oldPath: body.path,
        newPath: `${folder ? `${folder}/` : ""}${body.newTitle}.md`,
        oldTitle: "Alt",
        newTitle: body.newTitle,
        renamed: true,
        backups: [],
        updatedLinks: 0,
        filesWithLinks: [],
      });
    }
    return json({ error: "nicht erwartet" }, 404);
  }) as typeof fetch;
}

function renderDialog(request: RenameDialogRequest, onSaved?: (path: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const element = (next: RenameDialogRequest) => (
    <QueryClientProvider client={queryClient}>
      <RenameNoteDialog
        onOpenChange={() => undefined}
        onSaved={(path) => onSaved?.(path)}
        open
        request={next}
      />
    </QueryClientProvider>
  );
  const view = render(element(request));
  return { view, element };
}

test("Anlegen: Titelfeld ist bedienbar und der Titel wird der Dateiname", async () => {
  const sent: Sent[] = [];
  stubFetch(sent);
  const created: string[] = [];

  const { view } = renderDialog({ create: { folder: "00 Inbox" }, rename: null }, (path) =>
    created.push(path),
  );

  const user = userEvent.setup({ document: view.baseElement.ownerDocument });
  await new Promise((resolve) => setTimeout(resolve, 40));
  const input = view.getByRole("textbox") as HTMLInputElement;
  expect(input.disabled).toBe(false);
  await user.type(input, "Meine neue Notiz");
  expect(input.value).toBe("Meine neue Notiz");

  await user.click(view.getByRole("button", { name: "Anlegen" }));

  await waitFor(() => expect(created).toEqual(["00 Inbox/Meine neue Notiz.md"]));
  const write = sent.find((request) => request.path === "/api/brain/note");
  expect(write?.method).toBe("PUT");
  expect(write?.body).toMatchObject({
    path: "00 Inbox/Meine neue Notiz.md",
    mode: "create",
    content: "# Meine neue Notiz\n\n",
  });
  view.unmount();
});

test("Umbenennen: getippter Titel überlebt einen Parent-Re-Render mit neuem Request-Objekt", async () => {
  const sent: Sent[] = [];
  stubFetch(sent);
  const saved: string[] = [];

  const first: RenameDialogRequest = {
    rename: { path: "00 Inbox/Alte Notiz.md", currentTitle: "Alte Notiz" },
    create: null,
  };
  const { view, element } = renderDialog(first, (path) => saved.push(path));

  const user = userEvent.setup({ document: view.baseElement.ownerDocument });
  await new Promise((resolve) => setTimeout(resolve, 40));
  const input = view.getByRole("textbox") as HTMLInputElement;
  expect(input.value).toBe("Alte Notiz");
  await user.clear(input);
  await user.type(input, "Frischer Name");
  expect(input.value).toBe("Frischer Name");

  // Der Editor rendert bei jedem Statuswechsel neu und baut dabei ein neues Request-Objekt.
  view.rerender(
    element({
      rename: { path: "00 Inbox/Alte Notiz.md", currentTitle: "Alte Notiz" },
      create: null,
    }),
  );
  expect((view.getByRole("textbox") as HTMLInputElement).value).toBe("Frischer Name");

  await user.click(view.getByRole("button", { name: "Umbenennen" }));

  await waitFor(() => expect(saved).toEqual(["00 Inbox/Frischer Name.md"]));
  const rename = sent.find((request) => request.path === "/api/brain/notes/rename");
  expect(rename?.body).toMatchObject({
    path: "00 Inbox/Alte Notiz.md",
    newTitle: "Frischer Name",
    renameFile: true,
  });
  view.unmount();
});
