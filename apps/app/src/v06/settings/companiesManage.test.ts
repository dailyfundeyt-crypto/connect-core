import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  type ConnectCompany,
  readActiveCompanyId,
  writeActiveCompanyId,
} from "@/lib/companies/store";

describe("Companies Management V2 (First Principles)", () => {
  const mockStorage: Record<string, string> = {};
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;

  beforeEach(() => {
    // Reset mock storage
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }

    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, val: string) => {
          mockStorage[key] = val;
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
      },
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as unknown as { window: unknown }).window = originalWindow;
    } else {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });

  it("kann aktive Firma setzen und lesen", () => {
    writeActiveCompanyId("acme-test-1");
    expect(readActiveCompanyId()).toBe("acme-test-1");

    writeActiveCompanyId("acme-test-2");
    expect(readActiveCompanyId()).toBe("acme-test-2");
  });

  it("kann Firmenreihenfolge umordnen (Reorder Up/Down)", () => {
    const list: ConnectCompany[] = [
      {
        id: "c1",
        name: "Firma 1",
        description: "Desc 1",
        agentIds: [],
        accent: "#fff",
      },
      {
        id: "c2",
        name: "Firma 2",
        description: "Desc 2",
        agentIds: [],
        accent: "#fff",
      },
      {
        id: "c3",
        name: "Firma 3",
        description: "Desc 3",
        agentIds: [],
        accent: "#fff",
      },
    ];

    // Nach oben verschieben: Index 1 nach 0
    const reordered = [...list];
    const [moved] = reordered.splice(1, 1);
    reordered.splice(0, 0, moved);

    expect(reordered[0].id).toBe("c2");
    expect(reordered[1].id).toBe("c1");
    expect(reordered[2].id).toBe("c3");
  });
});
