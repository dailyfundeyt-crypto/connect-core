import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BrowserProfile, ProfileTab, ProfileTabGroup } from "@/contracts/v06/browser-profiles";
import { ProfileTabsBar } from "./ProfileTabsBar";
import { BrowserSplitLayout } from "./BrowserSplitLayout";

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

// ---------------------------------------------------------------------------
// fetch-Dispatcher
// ---------------------------------------------------------------------------

interface State {
  profiles: BrowserProfile[];
  groups: Map<string, ProfileTabGroup[]>;
  tabs: Map<string, ProfileTab[]>;
  brainTree: { available: boolean; files: { path: string; size: number; mtime: string }[] };
  brainFile: { path: string; content: string };
  calls: Array<{ url: string; init?: RequestInit }>;
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

function profileIdOf(url: string): string | null {
  const match = /\/api\/v06\/browser-profiles\/([^/?]+)(?:\/|$)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

function makeFetch(state: State): typeof fetch {
  const handler = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    state.calls.push({ url, init });

    if (url.startsWith("/api/brain/")) {
      if (url.startsWith("/api/brain/tree")) {
        return jsonResponse(state.brainTree);
      }
      if (url.startsWith("/api/brain/file")) {
        return jsonResponse({
          available: true,
          file: { ...state.brainFile, mtime: "2026-10-23T00:00:00Z", size: 64, readOnly: false },
        });
      }
      if (url.startsWith("/api/brain/status")) {
        return jsonResponse({ available: true, path: "brain", files: 1, head: null });
      }
      if (url.startsWith("/api/brain/backlinks")) {
        return jsonResponse({ available: true, backlinks: [] });
      }
      if (url.startsWith("/api/brain/agents")) {
        return jsonResponse({ available: false, agents: [] });
      }
      return jsonResponse({ available: false });
    }

    if (url.includes("/browser-profiles")) {
      if (url.includes("?agentId=") && method === "GET") {
        return jsonResponse(state.profiles);
      }
      const id = profileIdOf(url);
      if (!id) {
        if (method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { name: string };
          if (state.profiles.filter((p) => p.status === "active").length >= 10) {
            return jsonResponse({ error: "Maximal 10 Profile" }, 409);
          }
          const profile: BrowserProfile = {
            id: `p_${state.profiles.length + 1}`,
            agentId: "a1",
            name: body.name,
            color: "#2563eb",
            status: "active",
            createdAt: new Date().toISOString(),
          };
          state.profiles.push(profile);
          state.groups.set(profile.id, []);
          state.tabs.set(profile.id, []);
          return jsonResponse(profile, 201);
        }
        return jsonResponse({ error: "unbehandelt" }, 500);
      }

      if (url.includes("/end")) {
        const profile = state.profiles.find((p) => p.id === id);
        if (profile) profile.status = "ended";
        return jsonResponse({ ok: true, id, status: "ended" });
      }

      if (url.includes("/groups")) {
        const list = state.groups.get(id) ?? [];
        if (method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { name: string; parentId?: string };
          const group: ProfileTabGroup = {
            id: `g_${body.name}`,
            profileId: id,
            name: body.name,
            parentId: body.parentId,
            order: list.length,
          };
          list.push(group);
          state.groups.set(id, list);
          return jsonResponse(group, 201);
        }
        return jsonResponse(list);
      }

      if (url.includes("/tabs")) {
        const list = state.tabs.get(id) ?? [];
        if (method === "POST") {
          const body = JSON.parse(String(init?.body ?? "{}")) as { url: string; groupId?: string };
          const tab: ProfileTab = {
            id: `t_${list.length + 1}`,
            profileId: id,
            groupId: body.groupId,
            url: body.url,
            title: body.url,
            order: list.length,
          };
          list.push(tab);
          state.tabs.set(id, list);
          return jsonResponse(tab, 201);
        }
        return jsonResponse(list);
      }
    }

    return jsonResponse({ error: `unhandled ${url}` }, 500);
  };
  // happy-dom erwartet preconnect auf fetch (TS-Contract von lib.dom).
  return Object.assign(handler, {
    preconnect: (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error("preconnect nicht im browser-split Test erwartet");
    },
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------

const p1: BrowserProfile = {
  id: "p1",
  agentId: "a1",
  name: "Arbeit",
  color: "#0ea5e9",
  status: "active",
  createdAt: "2026-10-23T10:00:00Z",
};
const p2: BrowserProfile = {
  id: "p2",
  agentId: "a1",
  name: "Trading",
  color: "#f59e0b",
  status: "active",
  createdAt: "2026-10-23T10:05:00Z",
};

function makeState(): State {
  return {
    profiles: [p1, p2],
    groups: new Map([
      ["p1", [{ id: "g-p1-a", profileId: "p1", name: "Recherche", order: 0 }]],
      ["p2", [{ id: "g-p2-a", profileId: "p2", name: "Trading", order: 0 }]],
    ]),
    tabs: new Map([
      [
        "p1",
        [
          { id: "t1", profileId: "p1", url: "https://example.com/a", title: "Beispiel A", order: 0 },
          { id: "t2", profileId: "p1", url: "https://example.com/b", title: "Beispiel B", order: 1 },
        ],
      ],
      ["p2", [{ id: "t3", profileId: "p2", url: "https://example.com/c", title: "Beispiel C", order: 0 }]],
    ]),
    brainTree: {
      available: true,
      files: [{ path: "Plannung/ablauf.md", size: 64, mtime: "2026-10-23T00:00:00Z" }],
    },
    brainFile: { path: "Plannung/ablauf.md", content: "# Hallo aus Plannung\n\nInhalt." },
    calls: [],
  };
}

const originalFetch = globalThis.fetch;

interface FakeDataTransfer {
  setData: (format: string, value: string) => void;
  getData: (format: string) => string;
}

function makeDataTransfer(): FakeDataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (format, value) => {
      store.set(format, value);
    },
    getData: (format) => store.get(format) ?? "",
  };
}

function renderLayout(state: State, agentId = "a1") {
  globalThis.fetch = makeFetch(state) as typeof fetch;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserSplitLayout agentId={agentId} />
    </QueryClientProvider>,
  );
}

describe("BrowserSplitLayout (A16)", () => {
  const originalEnv = process.env.CONNECT_FLAGS_V06;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONNECT_FLAGS_V06 = originalEnv;
    } else {
      delete process.env.CONNECT_FLAGS_V06;
    }
    globalThis.fetch = originalFetch as typeof fetch;
  });

  test("Flag aus (Default): Komponente rendert null — alte Seite bleibt unverändert", () => {
    delete process.env.CONNECT_FLAGS_V06;
    const { container } = renderLayout(makeState());
    expect(container.firstElementChild).toBeNull();
  });

  test("Profilwechsel lädt Gruppen des neuen Profils", async () => {
    process.env.CONNECT_FLAGS_V06 = "browsersplitlayout";
    const state = makeState();
    const { container } = renderLayout(state);

    // Profil p1 zuerst: seine Gruppe ist sichtbar
    await waitFor(() => {
      expect(container.querySelector("[data-testid='group-row'][data-group-id='g-p1-a']")).not.toBeNull();
    });

    const callsBeforeP2 = state.calls.filter((c) => c.url.includes("/p2/groups")).length;
    fireEvent.click(container.querySelector("[data-testid='profile-tab'][data-profile-id='p2']")!);

    await waitFor(() => {
      expect(container.querySelector("[data-testid='group-row'][data-group-id='g-p2-a']")).not.toBeNull();
    });
    expect(state.calls.filter((c) => c.url.includes("/p2/groups")).length).toBeGreaterThan(
      callsBeforeP2,
    );
  });

  test("Drag & Drop: Tab im Baum auf eine Gruppe ziehen schickt PUT an den Tab-Endpunkt", async () => {
    process.env.CONNECT_FLAGS_V06 = "browsersplitlayout";
    const state = makeState();
    const { container } = renderLayout(state);

    await waitFor(() => {
      const firstChip = container.querySelector("[data-testid='group-tab-chip']");
      expect(firstChip).not.toBeNull();
    });

    const chip = container.querySelector("[data-testid='group-tab-chip']")!;
    const target = container.querySelector("[data-testid='group-row'][data-group-id='g-p1-a']")!;
    const dataTransfer = makeDataTransfer();
    dataTransfer.setData("text/x-connect-tab-id", chip.getAttribute("data-tab-id")!);

    fireEvent.dragStart(chip, { dataTransfer: dataTransfer as unknown as DataTransfer });
    fireEvent.dragOver(target, {
      dataTransfer: dataTransfer as unknown as DataTransfer,
    });
    fireEvent.drop(target, { dataTransfer: dataTransfer as unknown as DataTransfer });

    await waitFor(() => {
      const put = state.calls.find((c) => c.init?.method === "PUT" && c.url.includes("/tabs/"));
      expect(put).toBeDefined();
      const putBody = JSON.parse(String(put!.init?.body ?? "{}")) as { groupId?: string };
      expect(putBody.groupId).toBe("g-p1-a");
    });
  });

  test("Spark-Notiz öffnet im rechten Pane und der Rückweg zeigt die Tab-Ansicht", async () => {
    process.env.CONNECT_FLAGS_V06 = "browsersplitlayout";
    const state = makeState();
    const { container } = renderLayout(state);

    await waitFor(() => {
      expect(container.querySelector("[data-testid='group-tree-notes']")).not.toBeNull();
    });
    fireEvent.click(container.querySelector("[data-testid='note-button']")!);

    await waitFor(() => {
      const pane = container.querySelector("[data-testid='note-pane']");
      expect(pane).not.toBeNull();
      expect(pane!.textContent).toContain("Hallo aus Plannung");
    });

    // Rückweg zur Tab-Ansicht
    fireEvent.click(container.querySelector("[data-testid='note-pane-back']")!);
    await waitFor(() => {
      expect(container.querySelector("[data-testid='tab-stage']")).not.toBeNull();
      expect(container.querySelector("[data-testid='note-pane']")).toBeNull();
    });
  });

  test("„+“ ist deaktiviert bei 10 Profilen und nennt das Limit im Tooltip", () => {
    const ten: BrowserProfile[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      agentId: "a1",
      name: `Profil ${i + 1}`,
      color: "#0ea5e9",
      status: "active",
      createdAt: "2026-10-23T00:00:00Z",
    }));
    const { container } = render(
      <ProfileTabsBar
        activeProfileId="p0"
        onEnd={() => undefined}
        onCreate={() => undefined}
        onSelect={() => undefined}
        profiles={ten}
      />,
    );
    const plus = container.querySelector("[data-testid='new-profile-button']") as HTMLButtonElement | null;
    expect(plus).not.toBeNull();
    expect(plus!.disabled).toBe(true);
    expect(plus!.title).toContain("Maximal 10");
  });

  test("„+“ aktiviert unter dem Limit und legt ein Profil über die Leiste an", async () => {
    const created: string[] = [];
    const nine: BrowserProfile[] = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      agentId: "a1",
      name: `Profil ${i + 1}`,
      color: "#0ea5e9",
      status: "active",
      createdAt: "2026-10-23T00:00:00Z",
    }));
    const { container } = render(
      <ProfileTabsBar
        activeProfileId="p0"
        onEnd={() => undefined}
        onCreate={(name) => created.push(name)}
        onSelect={() => undefined}
        profiles={nine}
      />,
    );
    const plus = container.querySelector("[data-testid='new-profile-button']") as HTMLButtonElement;
    expect(plus.disabled).toBe(false);
    fireEvent.click(plus);
    const input = container.querySelector("[data-testid='new-profile-name']") as HTMLInputElement;
    // TYPED RATHER THAN SET: fireEvent.change bewegt nur den DOM-Wert, aber
    // React 19 in happy-dom nimmt kontrollierte Inputs nur echte Angebote an.
    await userEvent.type(input, "Privat");
    // Submit-Button klicken löst den onSubmit-Handler des Formulars aus.
    fireEvent.click(container.querySelector("[data-testid='new-profile-submit']")!);
    expect(created).toEqual(["Privat"]);
  });

  test("„Sitzung beenden“ fragt nach und beendet erst nach Bestätigung", () => {
    const ended: string[] = [];
    const { container } = render(
      <ProfileTabsBar
        activeProfileId="p1"
        onEnd={(id) => ended.push(id)}
        onCreate={() => undefined}
        onSelect={() => undefined}
        profiles={[p1]}
      />,
    );
    fireEvent.click(container.querySelector("[data-testid='end-session-button']")!);
    // Noch keine Bestätigung: nichts beendet
    expect(ended).toEqual([]);
    expect(container.querySelector("[data-testid='end-session-confirm']")).not.toBeNull();
    fireEvent.click(container.querySelector("[data-testid='end-session-confirm-yes']")!);
    expect(ended).toEqual(["p1"]);
  });
});
