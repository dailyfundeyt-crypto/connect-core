import { describe, expect, it, beforeEach } from "bun:test";
import {
  check,
  createSwarmGrant,
  listSwarmGrants,
  revokeSwarmGrant,
  clearGrantsForTests,
} from "./grants";
import { SUGGESTED_SWARM_GRANTS, seedSuggestedGrants } from "./seed-grants";
import { clearTokensForTests } from "./tokens";

describe("Swarm-Grants & Access Control (v06 / A18)", () => {
  beforeEach(() => {
    clearGrantsForTests();
    clearTokensForTests();
  });

  // =========================================================================
  // 1. Ohne Grant kein Zugriff (Default: verweigern)
  // =========================================================================
  it("Verweigert Zugriff ohne Grant (Default Deny)", () => {
    const res = check("unauthorized-agent", "c-hyper", "operate");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Kein SwarmGrant für Principal");
  });

  it("Verweigert Zugriff bei unpassender Firma", async () => {
    await createSwarmGrant({
      principal: "grokbot:hyper",
      companyId: "c-hyper",
      scopes: ["operate"],
    });

    const res = check("grokbot:hyper", "c-flux", "operate");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Keine Berechtigung für Firma \"c-flux\"");
  });

  it("Verweigert Zugriff bei fehlendem Scope", async () => {
    await createSwarmGrant({
      principal: "grokbot:hyper",
      companyId: "c-hyper",
      scopes: ["read"],
    });

    const res = check("grokbot:hyper", "c-hyper", "operate");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Scope \"operate\" ist für Principal");
  });

  // =========================================================================
  // 2. Erlaubt mit gültigem Grant
  // =========================================================================
  it("Erlaubt Zugriff mit passendem Grant und Scope", async () => {
    await createSwarmGrant({
      principal: "grokbot:hyper",
      companyId: "c-hyper",
      scopes: ["operate", "open_ui"],
    });

    const resOperate = check("grokbot:hyper", "c-hyper", "operate");
    expect(resOperate.allowed).toBe(true);

    const resUi = check("grokbot:hyper", "c-hyper", "open_ui");
    expect(resUi.allowed).toBe(true);
  });

  it("Erlaubt firmenübergreifenden Zugriff bei companyId '*'", async () => {
    await createSwarmGrant({
      principal: "connect-wartung",
      companyId: "*",
      scopes: ["read"],
    });

    expect(check("connect-wartung", "c-hyper", "read").allowed).toBe(true);
    expect(check("connect-wartung", "c-flux", "read").allowed).toBe(true);
    expect(check("connect-wartung", "any-company-999", "read").allowed).toBe(true);
  });

  it("'operate' Scope schließt 'read' automatisch ein", async () => {
    await createSwarmGrant({
      principal: "grokbot:flux",
      companyId: "c-flux",
      scopes: ["operate"],
    });

    expect(check("grokbot:flux", "c-flux", "read").allowed).toBe(true);
  });

  // =========================================================================
  // 3. Widerrufener Grant wirkt sofort
  // =========================================================================
  it("Widerrufener Grant wirkt sofort (revoked_at gesetzt)", async () => {
    const grant = await createSwarmGrant({
      principal: "cnt-code",
      companyId: "*",
      scopes: ["brain_write", "use_agents"],
    });

    // Zunächst erlaubt
    expect(check("cnt-code", "c-default", "brain_write").allowed).toBe(true);

    // Jetzt widerrufen
    const revoked = await revokeSwarmGrant(grant.id);
    expect(revoked).toBe(true);

    // Sofort verweigert
    const resAfter = check("cnt-code", "c-default", "brain_write");
    expect(resAfter.allowed).toBe(false);
    expect(resAfter.reason).toContain("wurden widerrufen");
  });

  // =========================================================================
  // 4. Vorschlags-Grants (Hyper, Flux, Wartung, Analysis, CNT Code)
  // =========================================================================
  it("Vorschlags-Grants enthalten alle geforderten 5 Principals", () => {
    const principals = SUGGESTED_SWARM_GRANTS.map((g) => g.principal);
    expect(principals).toContain("grokbot:hyper");
    expect(principals).toContain("grokbot:flux");
    expect(principals).toContain("connect-wartung");
    expect(principals).toContain("grokbot:analysis");
    expect(principals).toContain("cnt-code");
  });

  it("Seed-Funktion legt alle Vorschlags-Grants und Tokens an", async () => {
    const result = await seedSuggestedGrants();
    expect(result.createdGrants.length).toBe(5);
    expect(result.createdTokens.length).toBe(5);

    // Prüfung der Scopes
    const hyper = result.createdGrants.find((g) => g.principal === "grokbot:hyper")!;
    expect(hyper.scopes).toContain("operate");
    expect(hyper.scopes).toContain("open_ui");

    const cnt = result.createdGrants.find((g) => g.principal === "cnt-code")!;
    expect(cnt.scopes).toContain("brain_write");
    expect(cnt.scopes).toContain("use_agents");

    // Zweiter Aufruf darf keine Duplikate erzeugen
    const secondCall = await seedSuggestedGrants();
    expect(secondCall.createdGrants.length).toBe(0);
  });
});
