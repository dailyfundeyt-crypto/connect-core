/**
 * Avatar-Helfer der Connect-App (Lane A31).
 *
 * Testet:
 *  - Der Standardavatar ist deterministisch und deckt sich mit dem Server.
 *  - `getAgentAvatar` fragt nur einmal ab (Cache) und lädt auf Wunsch neu.
 *  - Flag aus: kein Request, kein Cache, das bisherige Bot-Bild bleibt.
 *  - `setAgentAvatar` aktualisiert den Cache.
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AVATAR_SHAPES } from "@/lib/t3/contracts";
import {
  clearAgentAvatarCache,
  defaultAgentAvatar,
  getAgentAvatar,
  hashAgentId,
  peekAgentAvatar,
  randomAgentAvatar,
  resolveAgentAvatar,
  setAgentAvatar,
} from "./agent-avatar";

const ORIGINAL_FLAGS = (
  window as typeof window & { __CONNECT_FLAGS_T3?: unknown }
).__CONNECT_FLAGS_T3;

function setFlag(value: boolean) {
  (
    window as typeof window & { __CONNECT_FLAGS_T3?: unknown }
  ).__CONNECT_FLAGS_T3 = value ? { mascot: true } : { mascot: false };
}

function restoreFlags() {
  const win = window as typeof window & { __CONNECT_FLAGS_T3?: unknown };
  if (ORIGINAL_FLAGS === undefined) delete win.__CONNECT_FLAGS_T3;
  else win.__CONNECT_FLAGS_T3 = ORIGINAL_FLAGS;
}

afterEach(restoreFlags);

describe("A31: Standardavatar", () => {
  it("liefert fuer dieselbe Agent-ID immer dieselbe Form", () => {
    expect(defaultAgentAvatar("agent-abc").shape).toBe(
      defaultAgentAvatar("agent-abc").shape,
    );
  });

  it("haengt die Form nur vom Hash der ID ab", () => {
    const hash = hashAgentId("agent-abc");
    expect(defaultAgentAvatar("agent-abc").shape).toBe(
      AVATAR_SHAPES[hash % AVATAR_SHAPES.length],
    );
  });

  it("nutzt Orange als Standardfarbe", () => {
    expect(defaultAgentAvatar("agent-abc").color).toBe("orange");
  });
});

describe("A31: Zufallsavatar", () => {
  it("liefert eine Form aus dem Vertrag", () => {
    const avatar = randomAgentAvatar();
    expect(AVATAR_SHAPES).toContain(avatar.shape);
    expect(avatar.color).toBe("orange");
  });

  it("liefert bei gleichem Zufallswert dieselbe Form", () => {
    expect(randomAgentAvatar({ random: () => 0.5 }).shape).toBe(
      randomAgentAvatar({ random: () => 0.5 }).shape,
    );
  });
});

describe("A31: Laden und Cachen", () => {
  let calls: string[];

  beforeEach(() => {
    clearAgentAvatarCache();
    calls = [];
    setFlag(true);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      calls.push(url);
      return new Response(
        JSON.stringify({
          agentId: "agent-abc",
          shape: "star",
          color: "blue",
          updatedAt: "2026-10-29T10:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
  });

  it("fragt beim ersten Mal ab und danach aus dem Cache", async () => {
    const first = await getAgentAvatar("agent-abc");
    expect(first?.shape).toBe("star");
    expect(calls.length).toBe(1);

    const second = await getAgentAvatar("agent-abc");
    expect(second?.shape).toBe("star");
    expect(calls.length).toBe(1);
    expect(peekAgentAvatar("agent-abc")?.color).toBe("blue");
  });

  it("laedt auf Wunsch neu", async () => {
    await getAgentAvatar("agent-abc");
    await getAgentAvatar("agent-abc", { refresh: true });
    expect(calls.length).toBe(2);
  });

  it("setzt den Avatar und aktualisiert den Cache", async () => {
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = typeof input === "string" ? input : String(input);
      calls.push(url);
      expect(init?.method).toBe("PUT");
      return new Response(
        JSON.stringify({
          agentId: "agent-abc",
          shape: "pumpkin",
          color: "green",
          updatedAt: "2026-10-29T10:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const saved = await setAgentAvatar("agent-abc", { shape: "pumpkin" });
    expect(saved.shape).toBe("pumpkin");
    expect(peekAgentAvatar("agent-abc")?.shape).toBe("pumpkin");
  });
});

describe("A31: Flag aus = altes Verhalten", () => {
  beforeEach(() => {
    clearAgentAvatarCache();
    setFlag(false);
    globalThis.fetch = (async () => {
      throw new Error("Es darf kein Request stattfinden.");
    }) as unknown as typeof fetch;
  });

  it("laedt keinen Avatar und fragt nicht ab", async () => {
    expect(await getAgentAvatar("agent-abc")).toBeNull();
    expect(peekAgentAvatar("agent-abc")).toBeUndefined();
  });

  it("zeigt weiterhin das bisherige Bot-Bild", () => {
    const presentation = resolveAgentAvatar("cto");
    expect(presentation.kind).toBe("image");
    if (presentation.kind === "image") {
      expect(presentation.url).toBe("/bots/cto.png");
    }
  });

  it("zeigt den Maskottchen-Avatar, wenn das Flag an ist", () => {
    setFlag(true);
    const presentation = resolveAgentAvatar("agent-abc", {
      agentId: "agent-abc",
      shape: "star",
      color: "blue",
      updatedAt: "2026-10-29T10:00:00.000Z",
    });
    expect(presentation.kind).toBe("mascot");
  });
});
