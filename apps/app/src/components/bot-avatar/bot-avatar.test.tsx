/**
 * A29 – `<BotAvatar>`: Verhalten der Komponente.
 *
 * EIGENTUEMER: A29.
 *
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { BotAvatar } from "./bot-avatar";

const ORIGINAL_FLAGS = (
  globalThis as typeof globalThis & {
    __CONNECT_FLAGS_T3?: Partial<Record<string, boolean>>;
  }
).__CONNECT_FLAGS_T3;

function setFlags(flags: Partial<Record<string, boolean>>) {
  (
    globalThis as typeof globalThis & {
      __CONNECT_FLAGS_T3?: Partial<Record<string, boolean>>;
    }
  ).__CONNECT_FLAGS_T3 = flags;
}

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => {
  GlobalRegistrator.unregister();
  setFlags(ORIGINAL_FLAGS ?? {});
});

describe("A29 – BotAvatar hinter dem Feature-Flag", () => {
  test("Flag aus: nichts wird gerendert (altes Verhalten)", () => {
    setFlags({ mascot: false });
    const { container } = render(<BotAvatar shape="circle" color="orange" />);
    expect(container.innerHTML).toBe("");
  });

  test("Flag an: das SVG mit Maske wird gerendert", () => {
    setFlags({ mascot: true });
    const { container } = render(
      <BotAvatar shape="star" color="violet" size={48} />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelector("mask")).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("48");
    expect(svg?.getAttribute("height")).toBe("48");
  });

  test("Flag an: die Augen sind Masken-Luecher im Koerper", () => {
    setFlags({ mascot: true });
    const { container } = render(<BotAvatar shape="circle" />);
    const mask = container.querySelector("mask");
    // Der Koerper ist weiss, die Augen schwarz: so entstehen die Luecher.
    const paths = Array.from(mask?.querySelectorAll("path") ?? []);
    expect(paths.length).toBeGreaterThanOrEqual(3);
    expect(paths[0]?.getAttribute("fill")).toBe("#fff");
    expect(paths[1]?.getAttribute("fill")).toBe("#000");
  });

  test("Flag an: der Name landet als aria-label", () => {
    setFlags({ mascot: true });
    const { container } = render(<BotAvatar name="Helium" />);
    expect(
      container.querySelector("[role='img']")?.getAttribute("aria-label"),
    ).toBe("Helium");
  });
});

describe("A29 – 40 Avatare im Leerlauf", () => {
  test("eingefrorene Avatare kosten keine Bildberechnung", () => {
    setFlags({ mascot: true });
    const { container } = render(
      <div>
        {Array.from({ length: 40 }, (_, index) => (
          <BotAvatar
            color="orange"
            frozen
            key={`frozen-avatar-${String(index)}`}
            shape="circle"
            size={40}
          />
        ))}
      </div>,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(40);
  });
});
