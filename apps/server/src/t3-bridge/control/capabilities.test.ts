/**
 * T3-Bridge — Provider-Fähigkeiten Tests (Lane A13).
 *
 * Akzeptanzkriterium:
 *  - Tests für JEDE Provider-Fähigkeit (Codex, Claude, Grok, Hermes, Freebuff,
 *    Cursor, OpenCode, Antigravity, Pi, Muse, AcpRegistry).
 */

import { describe, expect, it } from "bun:test";
import { T3_PROVIDER_IDS, type T3ProviderId } from "../contracts.js";
import {
  canProviderInterrupt,
  canProviderQueueSteer,
  canProviderSteer,
  getProviderControlCapabilities,
  KNOWN_PROVIDER_CAPABILITIES,
  toT3Capabilities,
} from "./capabilities.js";

describe("A13: Provider-Fähigkeiten (Capabilities Matrix)", () => {
  it("deckt alle 11 definierten T3-Provider aus den Verträgen lückenlos ab", () => {
    for (const providerId of T3_PROVIDER_IDS) {
      const caps = KNOWN_PROVIDER_CAPABILITIES[providerId];
      expect(caps).toBeDefined();
      expect(caps.providerId).toBe(providerId);
    }
  });

  describe("Provider mit aktivem Steeren (canSteer: true)", () => {
    it("Codex unterstützt Interrupt und aktives Steeren im Turn", () => {
      const caps = getProviderControlCapabilities("codex");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(true);
      expect(caps.canQueueSteer).toBe(true);
      expect(caps.canFork).toBe(true);
      expect(caps.canRollback).toBe(true);
      expect(canProviderSteer("codex")).toBe(true);
    });

    it("ClaudeAgent unterstützt Interrupt und aktives Steeren (unterbricht laufende Tools)", () => {
      const caps = getProviderControlCapabilities("claudeAgent");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(true);
      expect(caps.canQueueSteer).toBe(true);
      expect(caps.canFork).toBe(false);
      expect(canProviderSteer("claudeAgent")).toBe(true);
    });

    it("OpenCode unterstützt Interrupt und aktives Steeren", () => {
      const caps = getProviderControlCapabilities("opencode");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(true);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("opencode")).toBe(true);
    });

    it("Pi unterstützt Interrupt und aktives Steeren", () => {
      const caps = getProviderControlCapabilities("pi");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(true);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("pi")).toBe(true);
    });

    it("Muse unterstützt Interrupt und aktives Steeren", () => {
      const caps = getProviderControlCapabilities("muse");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(true);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("muse")).toBe(true);
    });
  });

  describe("Provider ohne aktives Steeren (canSteer: false -> Warteschlange)", () => {
    it("Cursor unterstützt Interrupt, aber KEIN aktives Steeren (Nachsteuern -> Queue)", () => {
      const caps = getProviderControlCapabilities("cursor");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(false);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("cursor")).toBe(false);
      expect(canProviderQueueSteer("cursor")).toBe(true);
    });

    it("Grok unterstützt Interrupt, aber KEIN aktives Steeren (ACP -> Queue)", () => {
      const caps = getProviderControlCapabilities("grok");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(false);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("grok")).toBe(false);
      expect(canProviderQueueSteer("grok")).toBe(true);
    });

    it("Hermes unterstützt Interrupt, aber KEIN aktives Steeren (ACP -> Queue)", () => {
      const caps = getProviderControlCapabilities("hermes");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(false);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("hermes")).toBe(false);
      expect(canProviderQueueSteer("hermes")).toBe(true);
    });

    it("Freebuff unterstützt Interrupt, aber KEIN aktives Steeren (ACP -> Queue)", () => {
      const caps = getProviderControlCapabilities("freebuff");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(false);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("freebuff")).toBe(false);
      expect(canProviderQueueSteer("freebuff")).toBe(true);
    });

    it("Antigravity unterstützt Interrupt, aber KEIN aktives Steeren (ACP -> Queue)", () => {
      const caps = getProviderControlCapabilities("antigravity");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(false);
      expect(caps.canQueueSteer).toBe(true);
      expect(canProviderSteer("antigravity")).toBe(false);
      expect(canProviderQueueSteer("antigravity")).toBe(true);
    });

    it("acpRegistry unterstützt Mehrinstanz-Subagenten, Interrupt, Steeren via Queue", () => {
      const caps = getProviderControlCapabilities("acpRegistry:marvin");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(false);
      expect(caps.canQueueSteer).toBe(true);
      expect(caps.canSubagent).toBe(true);
      expect(canProviderSteer("acpRegistry:marvin")).toBe(false);
      expect(canProviderQueueSteer("acpRegistry:marvin")).toBe(true);
    });
  });

  describe("Fallback & Unbekannte Provider", () => {
    it("liefert defensive Standard-Fähigkeiten bei unbekanntem Provider", () => {
      const caps = getProviderControlCapabilities("custom-new-driver");
      expect(caps.providerId).toBe("custom-new-driver");
      expect(caps.canInterrupt).toBe(true);
      expect(caps.canSteer).toBe(false);
      expect(caps.canQueueSteer).toBe(true);
    });

    it("liefert Standard-Fähigkeiten bei null/undefined", () => {
      const caps = getProviderControlCapabilities(null);
      expect(caps.providerId).toBe("unknown");
      expect(caps.canSteer).toBe(false);
    });
  });

  describe("Konvertierung zu T3Capabilities (Vertrag A01)", () => {
    it("erzeugt ein valides T3Capabilities-Objekt für die UI", () => {
      const caps = getProviderControlCapabilities("codex");
      const t3Caps = toT3Capabilities(caps);
      expect(t3Caps).toEqual({
        canInterrupt: true,
        canSteer: true,
        canApprove: true,
        canRollback: true,
        canFork: true,
        canPlan: true,
        canSubagent: true,
        canContextTransfer: true,
      });
    });
  });
});
