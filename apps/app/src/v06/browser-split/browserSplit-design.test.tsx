import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { BrowserProfile, ProfileTab, ProfileTabGroup } from "@/contracts/v06/browser-profiles";
import { ProfileTabsBar } from "./ProfileTabsBar";
import { GroupTree } from "./GroupTree";
import { TabStage } from "./TabStage";
import { NotePane } from "./NotePane";

beforeAll(() => GlobalRegistrator.register());
afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe("Browser-Split Design-System V2 (A36)", () => {
  const originalEnv = process.env.CONNECT_FLAGS_V06;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CONNECT_FLAGS_V06 = originalEnv;
    } else {
      delete process.env.CONNECT_FLAGS_V06;
    }
  });

  test("ProfileTabsBar rendert Design-System V2 Styling wenn designV2 aktiv ist", () => {
    process.env.CONNECT_FLAGS_V06 = "designv2";
    const profiles: BrowserProfile[] = [
      {
        id: "p1",
        agentId: "a1",
        name: "Standard",
        color: "#38bdf8",
        status: "active",
        createdAt: "2026-10-23T00:00:00Z",
      },
    ];
    const { container } = render(
      <ProfileTabsBar
        activeProfileId="p1"
        onCreate={() => {}}
        onEnd={() => {}}
        onSelect={() => {}}
        profiles={profiles}
      />,
    );

    const bar = container.querySelector("[data-testid='profile-tabs-bar']")!;
    expect(bar.className).toContain("var(--p-border)");
    expect(bar.className).toContain("var(--p-surface-1)");

    const tab = container.querySelector("[data-testid='profile-tab']")!;
    expect(tab.className).toContain("var(--p-radius-sm)");
    expect(tab.className).toContain("var(--p-surface-2)");
  });

  test("GroupTree nutzt hairline borders und token surfaces bei designV2", () => {
    process.env.CONNECT_FLAGS_V06 = "designv2";
    const groups: ProfileTabGroup[] = [
      { id: "g1", profileId: "p1", name: "Forschung", parentId: undefined, order: 0 },
    ];
    const tabs: ProfileTab[] = [
      { id: "t1", profileId: "p1", groupId: "g1", url: "https://example.com", title: "Example", order: 0 },
    ];

    const { container } = render(
      <GroupTree
        groups={groups}
        notes={["notizen/idee.md"]}
        onCreateGroup={() => {}}
        onMoveTab={() => {}}
        onOpenNote={() => {}}
        tabs={tabs}
      />,
    );

    const tree = container.querySelector("[data-testid='group-tree']")!;
    expect(tree.className).toContain("var(--p-border)");
    expect(tree.className).toContain("var(--p-surface-1)");

    const chip = container.querySelector("[data-testid='group-tab-chip']")!;
    expect(chip.className).toContain("var(--p-radius-sm)");
    expect(chip.className).toContain("var(--p-surface-2)");
  });

  test("TabStage nutzt EmptyState mit Design-Tokens bei leerem Profil", () => {
    process.env.CONNECT_FLAGS_V06 = "designv2";
    const { container } = render(
      <TabStage
        onCreateTab={() => Promise.resolve({ id: "t", profileId: "p", groupId: undefined, url: "", title: "", order: 0 })}
        onCloseTab={() => Promise.resolve(true)}
        profile={null}
        tabs={[]}
      />,
    );

    const empty = container.querySelector("[data-testid='tab-stage-empty']")!;
    expect(empty.className).toContain("var(--p-surface-1)");
    expect(container.textContent).toContain("Kein aktives Browser-Profil");
  });

  test("NotePane rendert Design-System V2 Token-Styling", () => {
    process.env.CONNECT_FLAGS_V06 = "designv2";
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <NotePane
          files={["test.md"]}
          notePath="test.md"
          onBack={() => {}}
          onOpen={() => {}}
        />
      </QueryClientProvider>,
    );

    const pane = container.querySelector("[data-testid='note-pane']")!;
    expect(pane.className).toContain("var(--p-bg)");
    const backBtn = container.querySelector("[data-testid='note-pane-back']")!;
    expect(backBtn.className).toContain("var(--p-border)");
    expect(backBtn.className).toContain("var(--p-surface-1)");
  });
});
