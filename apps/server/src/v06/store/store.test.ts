/**
 * Connect Store End-to-End & Unit Tests (v06 / A20)
 * Testet:
 * - Validierung von connect-package.json
 * - Ablehnung ungültiger Manifeste
 * - Ablehnung von Pfad-Traversal & verbotenen Binärdateien
 * - Ablehnung von Bezahlung in v1 (priceCents > 0)
 * - Upload -> Status 'review' -> Lokale Speicherung
 * - Stefan Admin-Review: 'review' -> 'published'
 * - Installation je kind (tool, mcp, skill, company) in Ziel-Firma
 * - Berechtigungsabfrage bei der Installation
 * - Feature-Flag Gating (FLAGS_V06.storeV1) & REST-Routen
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import {
  validateManifest,
  validatePackageFileTree,
  isPathTraversal,
  isForbiddenBinary,
} from "./packageValidator";
import {
  listStoreListings,
  getStoreListingById,
  saveStoreListing,
  resetMemoryListings,
} from "./listings";
import { uploadPackage, ensureStorePackagesDir } from "./upload";
import { approveListing, rejectListing, listPendingReviews } from "./review";
import {
  installPackage,
  listCompanyInstalls,
  resetMemoryInstalls,
  inMemoryInstalledMcp,
  inMemoryInstalledSkills,
  inMemoryInstalledCompanies,
} from "./install";
import { createStoreRouter } from "./routes";
import { FLAGS_V06 } from "../../contracts/v06/flags";

describe("Connect Store v06 – Manifest & PackageValidator", () => {
  it("akzeptiert ein vollständig gültiges Manifest", () => {
    const validManifest = {
      schemaVersion: "1.0",
      kind: "tool",
      slug: "markettrace-analyzer",
      name: "MarketTrace Analyzer",
      version: "1.0.0",
      summary: "Echtzeit-Kurse und technische Chart-Indikatoren",
      description: "Detaillierte Finanzanalysen mit automatischen Trend-Erkennungen.",
      author: { name: "Stefan Kunc", handle: "@stefan" },
      icon: "assets/icon.png",
      screenshots: ["assets/screen1.png"],
      entry: "index.html",
      permissions: ["network:outbound"],
      priceCents: 0,
      installSpec: {
        toolId: "markettrace-analyzer",
        name: "MarketTrace Analyzer",
        url: "https://markettrace.io",
      },
    };

    const res = validateManifest(validManifest);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.data?.slug).toBe("markettrace-analyzer");
    expect(res.data?.priceCents).toBe(0);
  });

  it("lehnt Manifeste mit fehlenden Pflichtfeldern oder ungültigem kind ab", () => {
    const invalidKind = {
      kind: "unsupported_game",
      slug: "test-game",
      name: "Test Game",
      version: "1.0.0",
      summary: "Test",
      description: "Test",
      author: "Test",
      permissions: [],
      priceCents: 0,
    };
    const res1 = validateManifest(invalidKind);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.includes("Invalid kind"))).toBe(true);

    const missingName = {
      kind: "mcp",
      slug: "valid-slug",
      version: "1.0.0",
      summary: "No name here",
      description: "Test",
      author: "Test",
      permissions: [],
      priceCents: 0,
    };
    const res2 = validateManifest(missingName);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("lehnt ungültige Slugs und ungültiges SemVer ab", () => {
    const badSlug = {
      kind: "skill",
      slug: "INVALID_SLUG_WITH_UPPERCASE!",
      name: "Bad Slug Skill",
      version: "1.0.0",
      summary: "Test",
      description: "Test",
      author: "Test",
      permissions: [],
      priceCents: 0,
    };
    const res1 = validateManifest(badSlug);
    expect(res1.valid).toBe(false);
    expect(res1.errors.some((e) => e.includes("slug"))).toBe(true);

    const badVersion = {
      kind: "skill",
      slug: "valid-skill",
      name: "Valid Skill",
      version: "v1_alpha_final",
      summary: "Test",
      description: "Test",
      author: "Test",
      permissions: [],
      priceCents: 0,
    };
    const res2 = validateManifest(badVersion);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("lehnt Bezahlung in v1 strikt ab (priceCents > 0)", () => {
    const paidManifest = {
      kind: "tool",
      slug: "paid-tool",
      name: "Paid Pro Tool",
      version: "1.0.0",
      summary: "Bezahltes Angebot",
      description: "Test",
      author: "Test",
      permissions: [],
      priceCents: 999, // 9.99 Euro
    };
    const res = validateManifest(paidManifest);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("priceCents"))).toBe(true);
  });

  it("erkennt und blockiert Pfad-Traversal in Dateipfaden und Manifesten", () => {
    expect(isPathTraversal("../../../etc/passwd")).toBe(true);
    expect(isPathTraversal("..\\..\\secret.key")).toBe(true);
    expect(isPathTraversal("C:\\Windows\\System32\\cmd.exe")).toBe(true);
    expect(isPathTraversal("/root/.ssh/id_rsa")).toBe(true);
    expect(isPathTraversal("assets/subfolder/../../secret")).toBe(true);
    expect(isPathTraversal("assets/logo.png")).toBe(false);
    expect(isPathTraversal("src/index.html")).toBe(false);

    const traversalManifest = {
      kind: "tool",
      slug: "traversal-test",
      name: "Traversal Test",
      version: "1.0.0",
      summary: "Test",
      description: "Test",
      author: "Test",
      entry: "../../escaped.html",
      permissions: [],
      priceCents: 0,
    };
    const res = validateManifest(traversalManifest);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("traversal"))).toBe(true);
  });

  it("erkennt und blockiert verbotene ausführbare Binärdateien in v1", () => {
    expect(isForbiddenBinary("payload.exe")).toBe(true);
    expect(isForbiddenBinary("inject.dll")).toBe(true);
    expect(isForbiddenBinary("script.bat")).toBe(true);
    expect(isForbiddenBinary("run.cmd")).toBe(true);
    expect(isForbiddenBinary("exploit.ps1")).toBe(true);
    expect(isForbiddenBinary("virus.vbs")).toBe(true);
    expect(isForbiddenBinary("native.so")).toBe(true);
    expect(isForbiddenBinary("document.pdf")).toBe(false);
    expect(isForbiddenBinary("index.html")).toBe(false);
    expect(isForbiddenBinary("app.js")).toBe(false);
    expect(isForbiddenBinary("icon.png")).toBe(false);

    const badFiles = [
      { path: "connect-package.json", size: 500 },
      { path: "bin/trojan.exe", size: 1024 },
    ];
    const treeRes = validatePackageFileTree(badFiles);
    expect(treeRes.valid).toBe(false);
    expect(treeRes.errors.some((e) => e.includes("executable binary"))).toBe(true);
  });
});

describe("Connect Store v06 – Upload & Admin Review Workflow", () => {
  beforeEach(() => {
    resetMemoryListings();
    resetMemoryInstalls();
    ensureStorePackagesDir();
  });

  it("speichert hochgeladene Pakete lokal und setzt Status auf 'review'", async () => {
    const rawManifest = {
      kind: "tool",
      slug: "custom-scraper",
      name: "Custom Web Scraper",
      version: "1.0.0",
      summary: "Extrahiert strukturierte Daten aus Webseiten",
      description: "Web Scraping Tool für Research-Agenten.",
      author: { name: "Test Developer" },
      entry: "index.html",
      permissions: ["network:outbound"],
      priceCents: 0,
      installSpec: {
        toolId: "custom-scraper",
        name: "Custom Web Scraper",
        url: "http://localhost:8080",
      },
    };

    const uploadRes = await uploadPackage({
      manifestRaw: rawManifest,
      authorId: "developer-123",
    });

    expect(uploadRes.ok).toBe(true);
    expect(uploadRes.listing).toBeDefined();
    expect(uploadRes.listing?.status).toBe("review"); // Strikte Anforderung: Nach Upload immer 'review'
    expect(uploadRes.packageHash).toBeDefined();
    expect(uploadRes.packagePath).toBeDefined();

    // Listing muss im Speicher auffindbar sein
    const item = await getStoreListingById("custom-scraper");
    expect(item).not.toBeNull();
    expect(item?.status).toBe("review");
  });

  it("ermöglicht lokale Admin-Freigabe (Stefan): 'review' -> 'published' und Ablehnung", async () => {
    const rawManifest = {
      kind: "mcp",
      slug: "slack-connector-mcp",
      name: "Slack Connector MCP",
      version: "1.0.0",
      summary: "Slack Channel Integration für Agenten",
      description: "Liest und sendet Nachrichten in Slack-Channels.",
      author: "Stefan Kunc",
      permissions: ["network:outbound"],
      priceCents: 0,
      installSpec: {
        serverId: "slack-mcp",
        title: "Slack Connector",
        vendor: "Slack",
        url: "mcp://slack",
      },
    };

    const upload = await uploadPackage({ manifestRaw: rawManifest });
    expect(upload.ok).toBe(true);
    const listingId = upload.listing!.id;

    // In Prüfung
    const pendingBefore = await listPendingReviews();
    expect(pendingBefore.some((p) => p.id === listingId)).toBe(true);

    // Admin Freigabe
    const approveRes = await approveListing(listingId, "stefan");
    expect(approveRes.ok).toBe(true);
    expect(approveRes.listing?.status).toBe("published");

    // Nach Freigabe nicht mehr in Pending
    const pendingAfter = await listPendingReviews();
    expect(pendingAfter.some((p) => p.id === listingId)).toBe(false);

    // Test Ablehnung (Reject)
    const rejectTarget = await uploadPackage({
      manifestRaw: { ...rawManifest, slug: "rejected-package" },
    });
    const rejectRes = await rejectListing(rejectTarget.listing!.id, "Sicherheitsbedenken", "stefan");
    expect(rejectRes.ok).toBe(true);
    expect(rejectRes.listing?.status).toBe("rejected");
  });
});

describe("Connect Store v06 – Installation je Kind in eine Firma", () => {
  beforeEach(() => {
    resetMemoryListings();
    resetMemoryInstalls();
  });

  it("verlangt Bestätigung für deklarierte Berechtigungen", async () => {
    const rawManifest = {
      kind: "tool",
      slug: "privileged-tool",
      name: "Privileged Tool",
      version: "1.0.0",
      summary: "Tool mit Berechtigungen",
      description: "Test",
      author: "Stefan",
      permissions: ["filesystem:write", "network:outbound"],
      priceCents: 0,
      installSpec: {
        toolId: "privileged-tool",
        permissions: ["filesystem:write", "network:outbound"],
      },
    };

    const upload = await uploadPackage({ manifestRaw: rawManifest });
    await approveListing(upload.listing!.id, "stefan");

    // Versuch ohne Bestätigung
    const resNoConfirm = await installPackage({
      listingId: upload.listing!.id,
      targetCompanyId: "comp-acme",
    });

    expect(resNoConfirm.ok).toBe(false);
    expect(resNoConfirm.requireConfirmation).toBe(true);
    expect(resNoConfirm.permissions).toContain("filesystem:write");

    // Mit expliziter Bestätigung
    const resConfirmed = await installPackage({
      listingId: upload.listing!.id,
      targetCompanyId: "comp-acme",
      confirmPermissions: true,
      acceptedPermissions: ["filesystem:write", "network:outbound"],
    });

    expect(resConfirmed.ok).toBe(true);
    expect(resConfirmed.permissionsAccepted).toContain("filesystem:write");
  });

  it("verhindert Installation von Listings im Status 'review' oder 'rejected'", async () => {
    const rawManifest = {
      kind: "skill",
      slug: "draft-skill",
      name: "Draft Skill",
      version: "1.0.0",
      summary: "Noch nicht geprüft",
      description: "Test",
      author: "Test",
      permissions: [],
      priceCents: 0,
    };

    const upload = await uploadPackage({ manifestRaw: rawManifest });
    // Status bleibt 'review'

    const res = await installPackage({
      listingId: upload.listing!.id,
      targetCompanyId: "comp-acme",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("cannot be installed");
  });

  it("installiert Tool-Paket (kind: 'tool') in Company-Tools", async () => {
    const toolListing = await getStoreListingById("markettrace");
    expect(toolListing).not.toBeNull();

    const installRes = await installPackage({
      listingId: toolListing!.id,
      targetCompanyId: "comp-nordwind",
      userId: "user-stefan",
    });

    expect(installRes.ok).toBe(true);
    expect(installRes.kind).toBe("tool");
    expect(installRes.installedItem?.toolId).toBe("markettrace");
    expect(installRes.installedItem?.enabled).toBe(true);

    const installs = await listCompanyInstalls("comp-nordwind");
    expect(installs.some((i) => i.listingId === toolListing!.id)).toBe(true);
  });

  it("installiert MCP-Paket (kind: 'mcp') in MCP-Server Registry", async () => {
    const mcpListing = await getStoreListingById("github-connector-mcp");
    expect(mcpListing).not.toBeNull();

    const installRes = await installPackage({
      listingId: mcpListing!.id,
      targetCompanyId: "comp-nordwind",
      userId: "user-stefan",
    });

    expect(installRes.ok).toBe(true);
    expect(installRes.kind).toBe("mcp");

    const registered = inMemoryInstalledMcp.get("comp-nordwind:github-connector");
    expect(registered).toBeDefined();
    expect(registered.vendor).toBe("GitHub");
  });

  it("installiert Skill-Paket (kind: 'skill') in Skill-Registry", async () => {
    const skillListing = await getStoreListingById("social-curator");
    expect(skillListing).not.toBeNull();

    const installRes = await installPackage({
      listingId: skillListing!.id,
      targetCompanyId: "comp-nordwind",
      userId: "user-stefan",
    });

    expect(installRes.ok).toBe(true);
    expect(installRes.kind).toBe("skill");

    const registered = inMemoryInstalledSkills.get("comp-nordwind:social-curator");
    expect(registered).toBeDefined();
    expect(registered.slug).toBe("social-curator");
    expect(registered.instructions).toContain("Social-Media-Manager");
  });

  it("installiert Firmen-Vorlage (kind: 'company') und initialisiert Workspace", async () => {
    const companyListing = await getStoreListingById("startup-starter-kit");
    expect(companyListing).not.toBeNull();

    const installRes = await installPackage({
      listingId: companyListing!.id,
      targetCompanyId: "comp-new-startup",
      userId: "user-stefan",
    });

    expect(installRes.ok).toBe(true);
    expect(installRes.kind).toBe("company");

    const createdCompany = inMemoryInstalledCompanies.get("comp-new-startup");
    expect(createdCompany).toBeDefined();
    expect(createdCompany.name).toBe("Startup Tech Labs");
    expect(createdCompany.agentIds).toContain("analyst");
    expect(createdCompany.agentIds).toContain("coder");
  });
});

describe("Connect Store v06 – REST Routen & Feature-Flag Gating", () => {
  beforeEach(() => {
    resetMemoryListings();
    resetMemoryInstalls();
    delete process.env.CONNECT_FLAGS_V06;
  });

  it("blockiert alle Endpunkte mit 404, wenn storeV1 deaktiviert ist", async () => {
    // Standard: storeV1 = false
    process.env.CONNECT_FLAGS_V06 = "no-storev1";

    const router = createStoreRouter();
    const req = new Request("http://localhost/listings", { method: "GET" });
    const res = await router.fetch(req);

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("disabled");
  });

  it("liefert Listings und erlaubt Upload/Review/Install, wenn storeV1 aktiv ist", async () => {
    // Flag aktivieren
    process.env.CONNECT_FLAGS_V06 = "storev1";

    const router = createStoreRouter();

    // 1. GET /listings
    const getReq = new Request("http://localhost/listings?kind=tool", { method: "GET" });
    const getRes = await router.fetch(getReq);
    expect(getRes.status).toBe(200);
    const listings = await getRes.json();
    expect(Array.isArray(listings)).toBe(true);
    expect(listings.some((l: any) => l.slug === "markettrace")).toBe(true);

    // 2. POST /listings/upload
    const newManifest = {
      kind: "tool",
      slug: "calculator-tool",
      name: "Smart Calculator",
      version: "1.0.0",
      summary: "Taschenrechner Tool",
      description: "Einfacher Rechner",
      author: "Stefan",
      permissions: [],
      priceCents: 0,
      installSpec: { toolId: "calc-tool" },
    };

    const uploadReq = new Request("http://localhost/listings/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newManifest),
    });

    const uploadRes = await router.fetch(uploadReq);
    expect(uploadRes.status).toBe(201);
    const uploadData = await uploadRes.json();
    expect(uploadData.ok).toBe(true);
    expect(uploadData.listing.status).toBe("review");

    // 3. POST /listings/:id/review (Freigabe durch Stefan)
    const reviewReq = new Request(`http://localhost/listings/${uploadData.listing.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const reviewRes = await router.fetch(reviewReq);
    expect(reviewRes.status).toBe(200);
    const reviewData = await reviewRes.json();
    expect(reviewData.listing.status).toBe("published");

    // 4. POST /listings/:id/install (Installation in Firma)
    const installReq = new Request(`http://localhost/listings/${uploadData.listing.id}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetCompanyId: "comp-acme" }),
    });
    const installRes = await router.fetch(installReq);
    expect(installRes.status).toBe(200);
    const installData = await installRes.json();
    expect(installData.ok).toBe(true);
    expect(installData.companyId).toBe("comp-acme");

    // 5. GET /installs
    const listInstallsReq = new Request("http://localhost/installs?companyId=comp-acme", {
      method: "GET",
    });
    const listInstallsRes = await router.fetch(listInstallsReq);
    expect(listInstallsRes.status).toBe(200);
    const companyInstalls = await listInstallsRes.json();
    expect(companyInstalls.some((i: any) => i.listingId === uploadData.listing.id)).toBe(true);
  });
});
