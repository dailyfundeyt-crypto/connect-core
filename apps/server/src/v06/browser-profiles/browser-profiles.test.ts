import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { join } from "node:path";
import {
  assertNotStefanHeliumProfile,
  getStefanHeliumUserDataDir,
  getTestProfileDirA09,
  resolveAgentProfileDir,
} from "./guard";
import { ProfileManager, ProfileLimitExceededError } from "./profileManager";
import { TabStore } from "./tabStore";
import { GroupStore } from "./groupStore";
import { createBrowserProfilesRouter } from "./routes";

describe("A09 Browser-Profile: Sicherheits-Guard", () => {
  it("schliesst Stefans Helium-Profil technisch zwingend aus", () => {
    const stefanDir = getStefanHeliumUserDataDir();
    expect(() => assertNotStefanHeliumProfile(stefanDir)).toThrow(
      "SICHERHEITSABBRUCH: Stefans eigenes Helium-Profil darf NIE verwendet werden!",
    );

    const subDir = join(stefanDir, "Default");
    expect(() => assertNotStefanHeliumProfile(subDir)).toThrow(
      "SICHERHEITSABBRUCH: Stefans eigenes Helium-Profil darf NIE verwendet werden!",
    );

    const explicitPath = "C:\\Users\\Kunc GmbH\\AppData\\Local\\imput\\Helium\\User Data";
    expect(() => assertNotStefanHeliumProfile(explicitPath)).toThrow(
      "SICHERHEITSABBRUCH: Stefans eigenes Helium-Profil darf NIE verwendet werden!",
    );
  });

  it("erlaubt zulaessige Agenten-Profile und Testprofil A09", () => {
    const testDir = getTestProfileDirA09();
    expect(() => assertNotStefanHeliumProfile(testDir)).not.toThrow();

    const agentDir = resolveAgentProfileDir("agent-willi", "profile-trading");
    expect(() => assertNotStefanHeliumProfile(agentDir)).not.toThrow();
    expect(agentDir).toContain("Connect");
    expect(agentDir).toContain("agent-profiles");
  });
});

describe("A09 Browser-Profile: ProfileManager & 10-Profile-Limit", () => {
  let manager: ProfileManager;

  beforeEach(() => {
    manager = new ProfileManager();
  });

  it("erstellt bis zu 10 Profile pro Agent mit getrennten user-data-dirs", async () => {
    const agentId = "agent-alpha";
    const createdDirs = new Set<string>();

    for (let i = 1; i <= 10; i++) {
      const profile = await manager.startProfile(agentId, `Profil ${i}`, {
        launchBrowser: false,
      });
      expect(profile.id).toBeDefined();
      expect(profile.name).toBe(`Profil ${i}`);
      expect(profile.status).toBe("active");

      const record = await manager.getProfile(profile.id);
      expect(record).not.toBeNull();
      expect(record!.userDataDir).toBeDefined();
      expect(record!.cdpPort).toBeGreaterThan(0);

      // Jedes Profil muss ein eigenes separates user-data-dir haben
      expect(createdDirs.has(record!.userDataDir)).toBe(false);
      createdDirs.add(record!.userDataDir);
    }

    expect(createdDirs.size).toBe(10);
    const activeCount = await manager.countActiveProfiles(agentId);
    expect(activeCount).toBe(10);
  });

  it("wirft ProfileLimitExceededError (409) beim 11. Profil eines Agenten", async () => {
    const agentId = "agent-beta";

    for (let i = 1; i <= 10; i++) {
      await manager.startProfile(agentId, `P${i}`, { launchBrowser: false });
    }

    await expect(
      manager.startProfile(agentId, "P11", { launchBrowser: false }),
    ).rejects.toThrow(ProfileLimitExceededError);
  });

  it("erlaubt Profil-Erstellung fuer einen anderen Agenten unabhaengig", async () => {
    const agent1 = "agent-1";
    const agent2 = "agent-2";

    for (let i = 1; i <= 10; i++) {
      await manager.startProfile(agent1, `A1-P${i}`, { launchBrowser: false });
    }

    const a2Profile = await manager.startProfile(agent2, "A2-P1", {
      launchBrowser: false,
    });
    expect(a2Profile.agentId).toBe(agent2);
  });
});

describe("A09 Browser-Profile: Tab-Gruppen (Ordner) & TabStore", () => {
  let groupStore: GroupStore;
  let tabStore: TabStore;

  beforeEach(() => {
    groupStore = new GroupStore();
    tabStore = new TabStore();
  });

  it("verwaltet Tab-Gruppen mit Reihenfolge und hierarchischer Zuordnung", async () => {
    const profileId = "prof_test_groups";
    const g1 = await groupStore.createGroup(profileId, { name: "Recherche" });
    const g2 = await groupStore.createGroup(profileId, { name: "Trading" });
    const g3 = await groupStore.createGroup(profileId, {
      name: "Sub-Ordner",
      parentId: g1.id,
    });

    const list = await groupStore.listGroups(profileId);
    expect(list.length).toBe(3);
    expect(list[0]!.name).toBe("Recherche");
    expect(list[2]!.parentId).toBe(g1.id);

    // Soft-Delete (Archivieren)
    const archived = await groupStore.archiveGroup(g2.id);
    expect(archived).toBe(true);

    const listAfter = await groupStore.listGroups(profileId);
    expect(listAfter.length).toBe(2);
    expect(listAfter.find((g) => g.id === g2.id)).toBeUndefined();
  });

  it("verwaltet Tabs innerhalb von Gruppen und sortiert nach Order", async () => {
    const profileId = "prof_test_tabs";
    const t1 = await tabStore.addTab(profileId, {
      url: "https://example.com/1",
      title: "Tab 1",
    });
    const t2 = await tabStore.addTab(profileId, {
      url: "https://example.com/2",
      title: "Tab 2",
      groupId: "grp_1",
    });

    const tabs = await tabStore.listTabs(profileId);
    expect(tabs.length).toBe(2);
    expect(tabs[1]!.groupId).toBe("grp_1");

    // Soft-Delete Tab
    await tabStore.archiveTab(t1.id);
    const tabsAfter = await tabStore.listTabs(profileId);
    expect(tabsAfter.length).toBe(1);
    expect(tabsAfter[0]!.id).toBe(t2.id);
  });
});

describe("A09 Browser-Profile: „Sitzung beenden“ & Tabs wiederherstellen", () => {
  let manager: ProfileManager;

  beforeEach(() => {
    manager = new ProfileManager();
  });

  it("schliesst nur dieses Profil, setzt status='ended' und behaelt gespeicherte Tabs", async () => {
    const agentId = "agent-persist";
    const p1 = await manager.startProfile(agentId, "Arbeits-Profil", {
      launchBrowser: false,
    });

    // Fuege Tabs zum Profil hinzu
    await manager.tabStore.addTab(p1.id, {
      url: "https://connect.imput.ai",
      title: "Connect Hub",
    });
    await manager.tabStore.addTab(p1.id, {
      url: "https://github.com",
      title: "GitHub",
    });

    // Sitzung beenden
    const endRes = await manager.endProfile(p1.id);
    expect(endRes.ok).toBe(true);
    expect(endRes.status).toBe("ended");

    // Pruefe Profil-Status
    const record = await manager.getProfile(p1.id);
    expect(record!.status).toBe("ended");
    expect(record!.endedAt).toBeDefined();

    // Tabs bleiben nach end gespeichert
    const savedTabs = await manager.tabStore.listTabs(p1.id);
    expect(savedTabs.length).toBe(2);
    expect(savedTabs[0]!.url).toBe("https://connect.imput.ai");
    expect(savedTabs[1]!.url).toBe("https://github.com");

    // Startet das Profil erneut (re-activate) -> Tabs bleiben erhalten
    const restarted = await manager.startProfile(agentId, "Arbeits-Profil", {
      profileId: p1.id,
      launchBrowser: false,
    });
    expect(restarted.status).toBe("active");

    const tabsOnRestart = await manager.tabStore.listTabs(restarted.id);
    expect(tabsOnRestart.length).toBe(2);
  });
});

describe("A09 Browser-Profile: REST-Endpunkte & Feature Flag", () => {
  let app: Hono;
  let manager: ProfileManager;
  const originalFlag = process.env.CONNECT_FLAGS_V06;

  beforeEach(() => {
    process.env.CONNECT_FLAGS_V06 = "browserProfiles";
    manager = new ProfileManager();
    const router = createBrowserProfilesRouter({ profileManager: manager });
    app = new Hono();
    app.route("/api/v06/browser-profiles", router);
  });

  afterEach(() => {
    process.env.CONNECT_FLAGS_V06 = originalFlag;
  });

  it("gibt 404 zurueck, wenn das Feature-Flag deaktiviert ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "no-browserprofiles";
    const res = await app.request("/api/v06/browser-profiles");
    expect(res.status).toBe(404);
  });

  it("POST /api/v06/browser-profiles erstellt Profil und liefert 201", async () => {
    const res = await app.request("/api/v06/browser-profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-rest",
        name: "Test Profil",
        color: "#ff0077",
        launchBrowser: false,
      }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.id).toBeDefined();
    expect(data.name).toBe("Test Profil");
    expect(data.color).toBe("#ff0077");
    expect(data.status).toBe("active");
  });

  it("POST /api/v06/browser-profiles liefert 409 bei mehr als 10 Profilen", async () => {
    const agentId = "agent-limit-rest";
    for (let i = 1; i <= 10; i++) {
      await manager.startProfile(agentId, `P${i}`, { launchBrowser: false });
    }

    const res = await app.request("/api/v06/browser-profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId,
        name: "P11",
        launchBrowser: false,
      }),
    });

    expect(res.status).toBe(409);
    const err = (await res.json()) as any;
    expect(err.error).toContain("Limit erreicht");
  });

  it("Tabs & Gruppen REST-Lifecycle", async () => {
    // 1. Profil erstellen
    const profile = await manager.startProfile("agent-tg", "TG-Profile", {
      launchBrowser: false,
    });

    // 2. Gruppe anlegen
    const grpRes = await app.request(
      `/api/v06/browser-profiles/${profile.id}/groups`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Research" }),
      },
    );
    expect(grpRes.status).toBe(201);
    const grp = (await grpRes.json()) as any;
    expect(grp.name).toBe("Research");

    // 3. Tab anlegen
    const tabRes = await app.request(
      `/api/v06/browser-profiles/${profile.id}/tabs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "https://wikipedia.org",
          title: "Wikipedia",
          groupId: grp.id,
        }),
      },
    );
    expect(tabRes.status).toBe(201);
    const tab = (await tabRes.json()) as any;
    expect(tab.url).toBe("https://wikipedia.org");
    expect(tab.groupId).toBe(grp.id);

    // 4. Tabs auflisten
    const listRes = await app.request(
      `/api/v06/browser-profiles/${profile.id}/tabs`,
    );
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as any[];
    expect(list.length).toBe(1);

    // 5. Sitzung beenden
    const endRes = await app.request(
      `/api/v06/browser-profiles/${profile.id}/end`,
      {
        method: "POST",
      },
    );
    expect(endRes.status).toBe(200);
    const endData = (await endRes.json()) as any;
    expect(endData.ok).toBe(true);
    expect(endData.status).toBe("ended");
  });
});
