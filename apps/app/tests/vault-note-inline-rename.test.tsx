import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultNoteEditor } from "@/components/companies/vault-note-editor";

/**
 * Umbenennen im Kopf: Klick auf den Titel, tippen, Enter.
 *
 * Der Dialog bleibt für Baum, Graph und Leser bestehen; der offene Editor soll aber
 * nicht erst ein Modal öffnen, nur um den Titel zu ändern. Der Test hält den Weg
 * fest, den ein Klick auf die Überschrift nimmt: Eingabefeld statt Dialog, Enter
 * schickt den neuen Titel an den Server, Esc bricht ohne Anfrage ab.
 */

beforeAll(() => GlobalRegistrator.register());
afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

const originalFetch = global.fetch;

type Sent = {
  path: string;
  method: string;
  body: Record<string, unknown> | null;
};

const NOTE_PATH = "00 Inbox/2026-10-23 16-22.md";
const NOTE_TITLE = "2026-10-23 16-22";
const CONTENT = "Ein Absatz, der den Editor fuellt.\n";

function stubFetch(
  sent: Sent[],
  newPath = "00 Inbox/Frischer Name.md",
  content = CONTENT,
) {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    sent.push({
      path,
      method: init?.method ?? "GET",
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null,
    });
    const json = (value: unknown) => Response.json(value);
    if (path.startsWith("/api/brain/file")) {
      return json({
        available: true,
        file: {
          path: NOTE_PATH,
          content,
          mtime: new Date().toISOString(),
          size: content.length,
        },
      });
    }
    if (path === "/api/brain/notes/rename") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        newTitle: string;
      };
      return json({
        available: true,
        oldPath: NOTE_PATH,
        newPath,
        oldTitle: NOTE_TITLE,
        newTitle: body.newTitle,
        renamed: true,
        backups: [],
        updatedLinks: 0,
        filesWithLinks: [],
      });
    }
    return json({ available: true, ok: true });
  }) as typeof fetch;
}

function draw(onPathChange: (path: string) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: createRootRoute({
      component: () => (
        <VaultNoteEditor onPathChange={onPathChange} path={NOTE_PATH} />
      ),
    }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function openTitleEditor(view: ReturnType<typeof render>) {
  const title = await view.findByRole("heading", { level: 1 });
  expect(title.textContent).toContain(NOTE_TITLE);
  const user = userEvent.setup({ document: view.baseElement.ownerDocument });
  const button = title.querySelector("button");
  if (!button) throw new Error("Der Titel ist nicht als Knopf gerendert.");
  await user.click(button);
  const input = view.getByRole("textbox", {
    name: "Notiz umbenennen",
  }) as HTMLInputElement;
  await waitFor(() => expect(input.ownerDocument.activeElement).toBe(input));
  return { input, user };
}

test("Enter benennt Titel und Datei um und meldet den neuen Pfad", async () => {
  const sent: Sent[] = [];
  stubFetch(sent);
  const renamed: string[] = [];
  const view = draw((path) => renamed.push(path));

  const { input, user } = await openTitleEditor(view);
  expect(input.value).toBe(NOTE_TITLE);
  await user.clear(input);
  await user.type(input, "Frischer Name{Enter}");

  await waitFor(() => expect(renamed).toEqual(["00 Inbox/Frischer Name.md"]));
  const rename = sent.find(
    (request) => request.path === "/api/brain/notes/rename",
  );
  expect(rename?.method).toBe("POST");
  expect(rename?.body).toMatchObject({
    path: NOTE_PATH,
    newTitle: "Frischer Name",
    renameFile: true,
  });
  expect(sent.some((request) => request.path === "/api/brain/note")).toBe(
    false,
  );
  view.unmount();
});

test("Notiz mit H1: Stift oeffnet den Titel trotzdem im Kopf", async () => {
  const sent: Sent[] = [];
  stubFetch(sent, "00 Inbox/Neue Ueberschrift.md", "# Alte Ueberschrift\n\nEin Absatz.\n");
  const renamed: string[] = [];
  const view = draw((path) => renamed.push(path));

  const user = userEvent.setup({ document: view.baseElement.ownerDocument });
  await view.findByText("Ein Absatz.");
  await user.click(view.getByRole("button", { name: "Titel umbenennen" }));
  const input = view.getByRole("textbox", { name: "Notiz umbenennen" }) as HTMLInputElement;
  expect(input.value).toBe("Alte Ueberschrift");
  await user.clear(input);
  await user.type(input, "Neue Ueberschrift{Enter}");

  await waitFor(() => expect(renamed).toEqual(["00 Inbox/Neue Ueberschrift.md"]));
  const rename = sent.find((request) => request.path === "/api/brain/notes/rename");
  expect(rename?.body).toMatchObject({
    path: NOTE_PATH,
    newTitle: "Neue Ueberschrift",
    renameFile: true,
  });
  view.unmount();
});

test("Esc schliesst das Feld, ohne den Server zu fragen", async () => {
  const sent: Sent[] = [];
  stubFetch(sent);
  const renamed: string[] = [];
  const view = draw((path) => renamed.push(path));

  const { input, user } = await openTitleEditor(view);
  await user.clear(input);
  await user.type(input, "Verworfen{Escape}");

  expect(view.queryByRole("textbox", { name: "Notiz umbenennen" })).toBeNull();
  expect(view.getByRole("heading", { level: 1 }).textContent).toContain(
    NOTE_TITLE,
  );
  expect(renamed).toEqual([]);
  expect(
    sent.some((request) => request.path === "/api/brain/notes/rename"),
  ).toBe(false);
  view.unmount();
});
