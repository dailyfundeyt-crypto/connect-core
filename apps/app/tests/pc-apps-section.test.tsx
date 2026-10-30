import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { PcAppsSection } from "@/components/sidebar-v2/pc-apps-section";

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(async () => {
  // Reacts Scheduler plant Arbeit ein, die nach dem Abmelden des DOM sonst ins Leere greift.
  await new Promise((resolve) => setTimeout(resolve, 0));
  GlobalRegistrator.unregister();
});

const originalFetch = globalThis.fetch;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

interface Call {
  url: string;
  method: string;
  body?: string;
}

const OBSIDIAN_SHORTCUT =
  "C:\\Users\\Test\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Obsidian.lnk";
const NOTEPAD_EXE = "C:\\Windows\\notepad.exe";

let calls: Call[] = [];
let accounts: Record<string, unknown>[] = [];

beforeEach(() => {
  calls = [];
  accounts = [
    {
      id: "pc-1",
      app: "pc",
      label: "Obsidian",
      metadata: { path: OBSIDIAN_SHORTCUT, name: "Obsidian" },
    },
  ];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({
      url,
      method,
      body: init?.body ? String(init.body) : undefined,
    });

    if (url === "/api/app-accounts" && method === "GET") {
      return json({ ok: true, accounts });
    }
    if (url === "/api/app-accounts" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        app: string;
        label: string;
        metadata: Record<string, unknown>;
      };
      const created = {
        id: "pc-2",
        app: body.app,
        label: body.label,
        metadata: body.metadata,
      };
      accounts.push(created);
      return json({ ok: true, account: created }, 201);
    }
    if (url === "/api/pc-apps") {
      return json({
        ok: true,
        apps: [
          { name: "Notepad", path: NOTEPAD_EXE },
          { name: "Obsidian", path: OBSIDIAN_SHORTCUT },
        ],
      });
    }
    if (/\/api\/app-accounts\/[^/]+\/launch$/.test(url) && method === "POST") {
      return json({ ok: true, message: "geöffnet" });
    }
    if (/\/api\/app-accounts\/[^/]+$/.test(url) && method === "DELETE") {
      return json({ ok: true });
    }
    return json({ ok: false }, 404);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("PcAppsSection", () => {
  test("listet PC-Apps und startet sie per Klick auf dem PC", async () => {
    const view = render(<PcAppsSection />);

    await waitFor(() => expect(view.getByText("Obsidian")).toBeTruthy());
    fireEvent.click(view.getByText("Obsidian"));

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.url === "/api/app-accounts/pc-1/launch" &&
            call.method === "POST",
        ),
      ).toBe(true),
    );
  });

  test("zeigt installierte Programme im Dialog an und speichert die Auswahl", async () => {
    const view = render(<PcAppsSection />);

    fireEvent.click(await view.findByText("App vom PC hinzufügen"));
    fireEvent.click(await view.findByText("Notepad"));

    await waitFor(() => {
      const post = calls.find(
        (call) => call.url === "/api/app-accounts" && call.method === "POST",
      );
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post?.body));
      expect(body.app).toBe("pc");
      expect(body.label).toBe("Notepad");
      expect(body.metadata.path).toBe(NOTEPAD_EXE);
    });
  });
});
