/**
 * T3-Bridge — Scheduler & Gleichzeitigkeit: Umfassende Testsuite
 *
 * EIGENTÜMER: A08 (Scheduler & Gleichzeitigkeit).
 * Prüft alle Akzeptanzkriterien aus MASTERPLAN-40-AGENTEN.md:
 *  - Startlimits (gesamt 5, Codex 3, Claude 2, sonst 1)
 *  - Status je Agent: läuft / wartet (Position) / schläft / pausiert (Limit/Last) / Fehler
 *  - Leerlauf > 15 min → T3-Session stoppen (onSessionSleep), bei nächster Nachricht aufwecken (resumeThread)
 *  - Hook für Lastschutz von A09 (keine neuen Turns, laufende nicht abbrechen)
 *  - Faire Reihenfolge (FIFO je Priorität) & Anti-Starvation (Aging)
 *  - Großer Simulationstest: 40 Agenten, je 3 Nachrichten (120 Turns) → nie mehr als Limit aktiv, alle fertig!
 */

import { describe, expect, it } from "bun:test";
import { FakeClock } from "./clock.js";
import { PriorityFifoQueue } from "./queue.js";
import { AgentStateManager } from "./agent-state.js";
import { T3Scheduler } from "./scheduler.js";
import type { QueuedTurn, TurnPriority } from "./types.js";

describe("A08: T3Scheduler & Gleichzeitigkeit", () => {
  /* ---------------------------------------------------------------------------------------- *
   * 1. FakeClock & Deterministische Zeit
   * ---------------------------------------------------------------------------------------- */
  describe("FakeClock", () => {
    it("spult Zeit deterministisch vor und führt fällige Timer aus", () => {
      const clock = new FakeClock(1000);
      let executed = false;

      clock.setTimeout(() => {
        executed = true;
      }, 500);

      clock.tick(499);
      expect(executed).toBe(false);
      expect(clock.now()).toBe(1499);

      clock.tick(1);
      expect(executed).toBe(true);
      expect(clock.now()).toBe(1500);
    });

    it("führt Intervalle mehrfach aus", () => {
      const clock = new FakeClock(0);
      let count = 0;

      const handle = clock.setInterval(() => {
        count++;
      }, 100);

      clock.tick(350);
      expect(count).toBe(3);

      clock.clearInterval(handle);
      clock.tick(300);
      expect(count).toBe(3);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 2. PriorityFifoQueue & Anti-Starvation
   * ---------------------------------------------------------------------------------------- */
  describe("PriorityFifoQueue", () => {
    it("bevorzugt höhere Prioritäten bei gleichem Alter", () => {
      const queue = new PriorityFifoQueue<string>();
      const makeTurn = (id: string, priority: TurnPriority, enqueuedAt: number): QueuedTurn<string> => ({
        turnId: id,
        agentId: "agent-1",
        provider: "codex",
        basePriority: priority,
        enqueuedAt,
        timeoutAt: enqueuedAt + 10000,
        execute: async () => id,
        resolve: () => {},
        reject: () => {},
        cancelled: false,
      });

      queue.enqueue(makeTurn("turn-low", "low", 1000));
      queue.enqueue(makeTurn("turn-normal", "normal", 1000));
      queue.enqueue(makeTurn("turn-urgent", "urgent", 1000));
      queue.enqueue(makeTurn("turn-high", "high", 1000));

      const first = queue.dequeueCandidate(1000);
      expect(first?.turnId).toBe("turn-urgent");

      const second = queue.dequeueCandidate(1000);
      expect(second?.turnId).toBe("turn-high");

      const third = queue.dequeueCandidate(1000);
      expect(third?.turnId).toBe("turn-normal");

      const fourth = queue.dequeueCandidate(1000);
      expect(fourth?.turnId).toBe("turn-low");
    });

    it("beachtet striktes FIFO innerhalb der gleichen Priorität", () => {
      const queue = new PriorityFifoQueue<string>();
      const makeTurn = (id: string, enqueuedAt: number): QueuedTurn<string> => ({
        turnId: id,
        agentId: "agent-1",
        provider: "codex",
        basePriority: "normal",
        enqueuedAt,
        timeoutAt: enqueuedAt + 10000,
        execute: async () => id,
        resolve: () => {},
        reject: () => {},
        cancelled: false,
      });

      queue.enqueue(makeTurn("turn-1", 100));
      queue.enqueue(makeTurn("turn-2", 200));
      queue.enqueue(makeTurn("turn-3", 300));

      expect(queue.dequeueCandidate(400)?.turnId).toBe("turn-1");
      expect(queue.dequeueCandidate(400)?.turnId).toBe("turn-2");
      expect(queue.dequeueCandidate(400)?.turnId).toBe("turn-3");
    });

    it("verhindert Verhungern durch Aging (Anti-Starvation)", () => {
      // Aging: alle 10 s +5 Punkte; Starvation-Schwelle: 60 s
      const queue = new PriorityFifoQueue<string>({
        agingIntervalMs: 10_000,
        starvationThresholdMs: 60_000,
      });

      const makeTurn = (id: string, priority: TurnPriority, enqueuedAt: number): QueuedTurn<string> => ({
        turnId: id,
        agentId: "agent-1",
        provider: "codex",
        basePriority: priority,
        enqueuedAt,
        timeoutAt: enqueuedAt + 500_000,
        execute: async () => id,
        resolve: () => {},
        reject: () => {},
        cancelled: false,
      });

      // Low-Turn wird bei t=0 eingereiht
      queue.enqueue(makeTurn("turn-old-low", "low", 0));

      // Bei t=70_000 trifft ein neuer Urgent-Turn ein
      queue.enqueue(makeTurn("turn-new-urgent", "urgent", 70_000));

      // Durch Starvation-Schutz (> 60s) muss der alte Low-Turn vor dem neuen Urgent-Turn rankommen!
      const next = queue.dequeueCandidate(70_000);
      expect(next?.turnId).toBe("turn-old-low");

      const following = queue.dequeueCandidate(70_000);
      expect(following?.turnId).toBe("turn-new-urgent");
    });

    it("berechnet korrekte 1-basierte Warteschlangenpositionen", () => {
      const queue = new PriorityFifoQueue<string>();
      const makeTurn = (id: string, agentId: string, priority: TurnPriority, enqueuedAt: number): QueuedTurn<string> => ({
        turnId: id,
        agentId,
        provider: "codex",
        basePriority: priority,
        enqueuedAt,
        timeoutAt: enqueuedAt + 10000,
        execute: async () => id,
        resolve: () => {},
        reject: () => {},
        cancelled: false,
      });

      queue.enqueue(makeTurn("t1", "agent-a", "normal", 100));
      queue.enqueue(makeTurn("t2", "agent-b", "high", 200));
      queue.enqueue(makeTurn("t3", "agent-c", "normal", 300));

      // t2 ist high -> Position 1
      // t1 ist normal (älter als t3) -> Position 2
      // t3 ist normal (jünger als t1) -> Position 3
      expect(queue.getPositionForTurn("t2", 400)).toBe(1);
      expect(queue.getPositionForTurn("t1", 400)).toBe(2);
      expect(queue.getPositionForTurn("t3", 400)).toBe(3);

      expect(queue.getPositionForAgent("agent-b", 400)).toBe(1);
      expect(queue.getPositionForAgent("agent-a", 400)).toBe(2);
      expect(queue.getPositionForAgent("agent-c", 400)).toBe(3);
    });

    it("räumt abgelaufene Turns auf (Purge Timed Out)", () => {
      const queue = new PriorityFifoQueue<string>();
      let rejected = false;

      const timedOutTurn: QueuedTurn<string> = {
        turnId: "t-exp",
        agentId: "agent-1",
        provider: "codex",
        basePriority: "normal",
        enqueuedAt: 1000,
        timeoutAt: 2000,
        execute: async () => "ok",
        resolve: () => {},
        reject: () => {
          rejected = true;
        },
        cancelled: false,
      };

      queue.enqueue(timedOutTurn);
      expect(queue.length).toBe(1);

      const purged = queue.purgeTimedOut(2500);
      expect(purged.length).toBe(1);
      expect(queue.length).toBe(0);
      expect(rejected).toBe(true);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 3. Start-Limits (Gesamt 5, Codex 3, Claude 2, sonst 1)
   * ---------------------------------------------------------------------------------------- */
  describe("Start-Limits & Provider-Gleichzeitigkeit", () => {
    it("blockiert Turns bei Erreichen der Provider-Grenzen (Codex max 3, Claude max 2, sonst 1)", async () => {
      const clock = new FakeClock();
      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
      });

      const activeExecutions: string[] = [];
      const resolvers: Record<string, () => void> = {};

      const runTurn = (id: string, agentId: string, provider: "codex" | "claudeAgent" | "grok") => {
        return scheduler.enqueueTurn({
          turnId: id,
          agentId,
          provider,
          execute: () => {
            activeExecutions.push(id);
            return new Promise<string>((resolve) => {
              resolvers[id] = () => {
                const idx = activeExecutions.indexOf(id);
                if (idx !== -1) activeExecutions.splice(idx, 1);
                resolve(id);
              };
            });
          },
        });
      };

      // 4 Codex-Turns starten -> nur 3 dürfen laufen, der 4. muss warten!
      const p1 = runTurn("codex-1", "agent-c1", "codex");
      const p2 = runTurn("codex-2", "agent-c2", "codex");
      const p3 = runTurn("codex-3", "agent-c3", "codex");
      const p4 = runTurn("codex-4", "agent-c4", "codex");

      // Give microtasks a moment
      await Promise.resolve();

      expect(activeExecutions).toEqual(["codex-1", "codex-2", "codex-3"]);
      expect(scheduler.getActiveTurnsByProvider("codex")).toBe(3);
      expect(scheduler.getAgentState("agent-c4")?.status).toBe("paused");
      expect(scheduler.getAgentState("agent-c4")?.pauseReason).toBe("limit");

      // Wenn codex-1 fertig wird, startet sofort codex-4
      resolvers["codex-1"]();
      await p1;

      expect(activeExecutions).toEqual(["codex-2", "codex-3", "codex-4"]);
      expect(scheduler.getActiveTurnsByProvider("codex")).toBe(3);
      expect(scheduler.getAgentState("agent-c4")?.status).toBe("running");

      // Claude: maximal 2 gleichzeitig
      const pC1 = runTurn("claude-1", "agent-cl1", "claudeAgent");
      const pC2 = runTurn("claude-2", "agent-cl2", "claudeAgent");
      const pC3 = runTurn("claude-3", "agent-cl3", "claudeAgent");

      await Promise.resolve();
      // Gesamtlimit ist 5: 3 Codex + 2 Claude = 5 aktiv!
      expect(scheduler.getStats().activeTurnsTotal).toBe(5);
      expect(scheduler.getActiveTurnsByProvider("claudeAgent")).toBe(2);
      expect(scheduler.getAgentState("agent-cl3")?.status).toBe("paused");

      // Grok: Standard-Limit = 1, aber Gesamtlimit ist voll (5/5)
      const pG1 = runTurn("grok-1", "agent-g1", "grok");
      await Promise.resolve();
      expect(activeExecutions.includes("grok-1")).toBe(false);

      // Einen Codex Turn beenden -> Grok-1 startet (Grok hat Limit 1 und Slot ist frei)
      resolvers["codex-2"]();
      await p2;
      expect(activeExecutions.includes("grok-1")).toBe(true);

      // Einen Claude Turn beenden -> claude-3 kann starten
      resolvers["claude-1"]();
      await pC1;
      expect(activeExecutions.includes("claude-3")).toBe(true);

      // Alle restlichen aktiven Turns auflösen
      resolvers["codex-3"]();
      resolvers["codex-4"]();
      resolvers["claude-2"]();
      resolvers["claude-3"]();
      resolvers["grok-1"]();

      await Promise.all([p3, p4, pC2, pC3, pG1]);

      expect(scheduler.getStats().activeTurnsTotal).toBe(0);
      scheduler.dispose();
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 4. Leerlauf > 15 min & Aufwecken (resumeThread) mit FakeClock
   * ---------------------------------------------------------------------------------------- */
  describe("Leerlauf > 15 min & Aufwecken", () => {
    it("legt Agenten nach 15 min Leerlauf schlafen und weckt sie bei nächster Nachricht auf", async () => {
      const clock = new FakeClock(1_000_000);
      const sleptAgents: string[] = [];
      const resumedAgents: string[] = [];

      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
        config: {
          idleSessionTimeoutMinutes: 15,
        },
        onSessionSleep: (agentId, ctx) => {
          sleptAgents.push(`${agentId}:${ctx.idleMs}`);
        },
        onResumeThread: (agentId) => {
          resumedAgents.push(agentId);
        },
      });

      // Agent 1 führt einen Turn aus
      await scheduler.enqueueTurn({
        turnId: "t1",
        agentId: "agent-sleepy",
        provider: "codex",
        execute: async () => "turn 1 done",
      });

      // Direkt nach Turn-Abschluss: Agent ist idle, wach
      let state = scheduler.getAgentState("agent-sleepy");
      expect(state?.status).toBe("idle");
      expect(state?.isAwake).toBe(true);

      // Nach 10 Minuten: immer noch idle
      clock.tick(10 * 60 * 1000);
      await scheduler.checkIdleSessions();
      state = scheduler.getAgentState("agent-sleepy");
      expect(state?.status).toBe("idle");
      expect(sleptAgents.length).toBe(0);

      // Weitere 5 Minuten vergehen (insgesamt 15 Minuten Leerlauf):
      clock.tick(5 * 60 * 1000 + 1);
      const sleeping = await scheduler.checkIdleSessions();

      expect(sleeping).toEqual(["agent-sleepy"]);
      state = scheduler.getAgentState("agent-sleepy");
      expect(state?.status).toBe("sleeping");
      expect(state?.runtimeState).toBe("sleeping");
      expect(state?.isAwake).toBe(false);
      expect(sleptAgents.length).toBe(1);

      // Neue Nachricht für schlafenden Agenten trifft ein -> muss aufgeweckt werden (resumeThread Hook)!
      const result = await scheduler.enqueueTurn({
        turnId: "t2",
        agentId: "agent-sleepy",
        provider: "codex",
        execute: async () => "turn 2 done",
      });

      expect(result).toBe("turn 2 done");
      expect(resumedAgents).toEqual(["agent-sleepy"]);

      state = scheduler.getAgentState("agent-sleepy");
      expect(state?.isAwake).toBe(true);
      expect(state?.status).toBe("idle");

      scheduler.dispose();
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 5. Lastschutz-Hook von A09
   * ---------------------------------------------------------------------------------------- */
  describe("Lastschutz-Hook (A09)", () => {
    it("stoppt neue Starts bei Lastschutz, bricht aber laufende Turns NICHT ab", async () => {
      const clock = new FakeClock();
      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
      });

      let turnRunning = false;
      let resolveRunningTurn: () => void = () => {};

      // 1. Ein Turn startet regulär
      const p1 = scheduler.enqueueTurn({
        turnId: "turn-running",
        agentId: "agent-1",
        provider: "codex",
        execute: () => {
          turnRunning = true;
          return new Promise<string>((resolve) => {
            resolveRunningTurn = () => {
              turnRunning = false;
              resolve("done-running");
            };
          });
        },
      });

      await Promise.resolve();
      expect(turnRunning).toBe(true);
      expect(scheduler.getAgentState("agent-1")?.status).toBe("running");

      // 2. A09 meldet Hochlast (Lastschutz aktiv)
      scheduler.setResourceThrottled(true, "CPU 94% über Schwelle");
      expect(scheduler.isResourceThrottled()).toBe(true);
      expect(scheduler.getResourceThrottleReason()).toBe("CPU 94% über Schwelle");

      // Laufender Turn bleibt unberührt!
      expect(turnRunning).toBe(true);

      // 3. Neuer Turn wird eingereicht während Lastschutz aktiv
      let secondTurnStarted = false;
      const p2 = scheduler.enqueueTurn({
        turnId: "turn-throttled",
        agentId: "agent-2",
        provider: "codex",
        execute: async () => {
          secondTurnStarted = true;
          return "done-second";
        },
      });

      await Promise.resolve();
      // Neuer Turn darf NICHT starten
      expect(secondTurnStarted).toBe(false);
      expect(scheduler.getAgentState("agent-2")?.status).toBe("paused");
      expect(scheduler.getAgentState("agent-2")?.pauseReason).toBe("load");

      // 4. Laufender Turn beendet sich regulär
      resolveRunningTurn();
      const r1 = await p1;
      expect(r1).toBe("done-running");

      // Trotz freiem Slot darf der zweite Turn immer noch NICHT starten, solange Throttled!
      await Promise.resolve();
      expect(secondTurnStarted).toBe(false);

      // 5. A09 hebt Lastschutz auf
      scheduler.setResourceThrottled(false);

      // Nun startet der wartende Turn sofort
      const r2 = await p2;
      expect(r2).toBe("done-second");
      expect(secondTurnStarted).toBe(true);

      scheduler.dispose();
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 6. Dynamische Limits (A25) & Fleet States (A36)
   * ---------------------------------------------------------------------------------------- */
  describe("Dynamische Konfiguration & Fleet States", () => {
    it("erlaubt Anpassen der Limits über A25", async () => {
      const clock = new FakeClock();
      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
      });

      expect(scheduler.getLimits().maxConcurrentTurns).toBe(5);
      expect(scheduler.getProviderLimit("codex")).toBe(3);

      scheduler.updateLimits({
        maxConcurrentTurns: 8,
        providerLimits: { codex: 6 },
      });

      expect(scheduler.getLimits().maxConcurrentTurns).toBe(8);
      expect(scheduler.getProviderLimit("codex")).toBe(6);

      scheduler.dispose();
    });

    it("liefert Fleet-Zustände passend für A36", async () => {
      const clock = new FakeClock(1000);
      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
      });

      let resolveTurn: () => void = () => {};
      scheduler.enqueueTurn({
        turnId: "turn-fleet",
        agentId: "agent-alpha",
        agentName: "Alpha Bot",
        provider: "codex",
        execute: () => new Promise<void>((r) => { resolveTurn = r; }),
      });

      await Promise.resolve();
      const fleet = scheduler.getFleetStates();
      expect(fleet.length).toBe(1);
      expect(fleet[0].agentId).toBe("agent-alpha");
      expect(fleet[0].name).toBe("Alpha Bot");
      expect(fleet[0].state).toBe("running");

      resolveTurn();
      await Promise.resolve();
      scheduler.dispose();
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 7. Akzeptanz-Simulation: 40 Agenten, je 3 Nachrichten (120 Turns)
   * ---------------------------------------------------------------------------------------- */
  describe("Akzeptanz-Simulation: 40 Agenten x 3 Nachrichten", () => {
    it("führt 120 Turns von 40 Agenten aus; hält alle Limits strikt ein und schließt alle erfolgreich ab", async () => {
      const clock = new FakeClock();
      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
        config: {
          maxConcurrentTurns: 5,
          providerLimits: {
            codex: 3,
            claudeAgent: 2,
            grok: 1,
            cursor: 1,
            freebuff: 1,
          },
        },
      });

      // 40 Agenten mit unterschiedlichen Providern definieren:
      // - 15 Codex
      // - 10 Claude
      // - 5 Grok
      // - 5 Cursor
      // - 5 Freebuff
      type SimAgent = { id: string; provider: "codex" | "claudeAgent" | "grok" | "cursor" | "freebuff" };
      const agents: SimAgent[] = [];

      for (let i = 1; i <= 40; i++) {
        let provider: SimAgent["provider"] = "freebuff";
        if (i <= 15) provider = "codex";
        else if (i <= 25) provider = "claudeAgent";
        else if (i <= 30) provider = "grok";
        else if (i <= 35) provider = "cursor";

        agents.push({ id: `agent-${i.toString().padStart(2, "0")}`, provider });
      }

      expect(agents.length).toBe(40);

      // Invarianten-Tracker
      let maxObservedTotal = 0;
      let maxObservedCodex = 0;
      let maxObservedClaude = 0;
      let maxObservedGrok = 0;
      let maxObservedCursor = 0;
      let maxObservedFreebuff = 0;
      let currentTotalActive = 0;
      const currentProviderActive: Record<string, number> = {
        codex: 0,
        claudeAgent: 0,
        grok: 0,
        cursor: 0,
        freebuff: 0,
      };

      let completedTurns = 0;

      const executeAgentMessage = (agent: SimAgent, messageIndex: number): Promise<string> => {
        const turnId = `${agent.id}-msg-${messageIndex}`;

        return scheduler.enqueueTurn({
          turnId,
          agentId: agent.id,
          provider: agent.provider,
          execute: async () => {
            // Track start
            currentTotalActive++;
            currentProviderActive[agent.provider]++;

            if (currentTotalActive > maxObservedTotal) maxObservedTotal = currentTotalActive;
            if (currentProviderActive.codex > maxObservedCodex) maxObservedCodex = currentProviderActive.codex;
            if (currentProviderActive.claudeAgent > maxObservedClaude) maxObservedClaude = currentProviderActive.claudeAgent;
            if (currentProviderActive.grok > maxObservedGrok) maxObservedGrok = currentProviderActive.grok;
            if (currentProviderActive.cursor > maxObservedCursor) maxObservedCursor = currentProviderActive.cursor;
            if (currentProviderActive.freebuff > maxObservedFreebuff) maxObservedFreebuff = currentProviderActive.freebuff;

            // Invarianten-Assertion während der Ausführung
            expect(currentTotalActive).toBeLessThanOrEqual(5);
            expect(currentProviderActive.codex).toBeLessThanOrEqual(3);
            expect(currentProviderActive.claudeAgent).toBeLessThanOrEqual(2);
            expect(currentProviderActive.grok).toBeLessThanOrEqual(1);
            expect(currentProviderActive.cursor).toBeLessThanOrEqual(1);
            expect(currentProviderActive.freebuff).toBeLessThanOrEqual(1);

            // Simulierter Rechenschritt (asynchron)
            await new Promise((resolve) => setTimeout(resolve, 2));

            // Track end
            currentTotalActive--;
            currentProviderActive[agent.provider]--;
            completedTurns++;

            return `ok-${turnId}`;
          },
        });
      };

      // Jeder der 40 Agenten sendet 3 Nachrichten nacheinander
      const agentRunners = agents.map(async (agent) => {
        const r1 = await executeAgentMessage(agent, 1);
        expect(r1).toBe(`ok-${agent.id}-msg-1`);

        const r2 = await executeAgentMessage(agent, 2);
        expect(r2).toBe(`ok-${agent.id}-msg-2`);

        const r3 = await executeAgentMessage(agent, 3);
        expect(r3).toBe(`ok-${agent.id}-msg-3`);
      });

      // Warten bis alle 40 Agenten alle 3 Turns abgeschlossen haben
      await Promise.all(agentRunners);

      // Verifikationen
      expect(completedTurns).toBe(120);
      expect(maxObservedTotal).toBeLessThanOrEqual(5);
      expect(maxObservedCodex).toBeLessThanOrEqual(3);
      expect(maxObservedClaude).toBeLessThanOrEqual(2);
      expect(maxObservedGrok).toBeLessThanOrEqual(1);
      expect(maxObservedCursor).toBeLessThanOrEqual(1);
      expect(maxObservedFreebuff).toBeLessThanOrEqual(1);

      // Scheduler ist am Ende wieder vollständig leer
      const stats = scheduler.getStats();
      expect(stats.activeTurnsTotal).toBe(0);
      expect(stats.queuedTurnsTotal).toBe(0);

      scheduler.dispose();
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 8. Weitere Randfälle: Abbruch, Fehlerbehandlung, RAM-Limits, Feature-Flag
   * ---------------------------------------------------------------------------------------- */
  describe("Zusätzliche Randfälle", () => {
    it("ermöglicht Abbruch von Turns in der Warteschlange", async () => {
      const clock = new FakeClock();
      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
        config: { maxConcurrentTurns: 1 },
      });

      let resolveFirst: () => void = () => {};
      const p1 = scheduler.enqueueTurn({
        turnId: "t1",
        agentId: "a1",
        provider: "codex",
        execute: () => new Promise<string>((r) => { resolveFirst = () => r("t1-done"); }),
      });

      const p2 = scheduler.enqueueTurn({
        turnId: "t2",
        agentId: "a2",
        provider: "codex",
        execute: async () => "t2-done",
      });

      expect(scheduler.getStats().queuedTurnsTotal).toBe(1);

      // Turn t2 in Queue abbrechen
      const cancelled = scheduler.cancelTurn("t2", "Benutzerabbruch");
      expect(cancelled).toBe(true);
      expect(scheduler.getStats().queuedTurnsTotal).toBe(0);

      // p2 muss mit dem Abbruchgrund ablehnen
      let errorCaught = false;
      try {
        await p2;
      } catch (err: unknown) {
        errorCaught = true;
        expect((err as Error).message).toContain("Benutzerabbruch");
      }
      expect(errorCaught).toBe(true);

      resolveFirst();
      await p1;
      scheduler.dispose();
    });

    it("verarbeitet Queue nach Turn-Fehlern weiter (kein Deadlock)", async () => {
      const clock = new FakeClock();
      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
        config: { maxConcurrentTurns: 1 },
      });

      // t1 schlägt fehl
      const p1 = scheduler.enqueueTurn({
        turnId: "t1",
        agentId: "a1",
        provider: "codex",
        execute: async () => {
          throw new Error("Provider-Crash");
        },
      });

      // t2 wartet in Queue
      const p2 = scheduler.enqueueTurn({
        turnId: "t2",
        agentId: "a2",
        provider: "codex",
        execute: async () => "t2-success",
      });

      // t1 muss fehlschlagen
      let p1Failed = false;
      try {
        await p1;
      } catch (err: unknown) {
        p1Failed = true;
        expect((err as Error).message).toBe("Provider-Crash");
      }
      expect(p1Failed).toBe(true);

      // Agent a1 muss im Status error sein
      expect(scheduler.getAgentState("a1")?.status).toBe("error");

      // t2 muss trotzdem erfolgreich abgearbeitet werden!
      const r2 = await p2;
      expect(r2).toBe("t2-success");
      expect(scheduler.getAgentState("a2")?.status).toBe("idle");

      scheduler.dispose();
    });

    it("begrenzt die Anzahl gleichzeitig wacher Agenten (maxAwakeAgents / RAM-Schutz)", async () => {
      const clock = new FakeClock(1000);
      const sleptAgents: string[] = [];

      const scheduler = new T3Scheduler({
        clock,
        bypassWhenFlagDisabled: false,
        autoStartIdleTimer: false,
        config: {
          maxAwakeAgents: 2, // Nur 2 gleichzeitig im RAM
        },
        onSessionSleep: (agentId) => {
          sleptAgents.push(agentId);
        },
      });

      // 1. Agent A führt Turn aus
      await scheduler.enqueueTurn({
        turnId: "t-a",
        agentId: "agent-a",
        provider: "codex",
        execute: async () => "ok",
      });

      clock.tick(1000);

      // 2. Agent B führt Turn aus
      await scheduler.enqueueTurn({
        turnId: "t-b",
        agentId: "agent-b",
        provider: "codex",
        execute: async () => "ok",
      });

      clock.tick(1000);

      // 3. Agent C führt Turn aus -> Limit 2 überschritten, ältester idle-Agent (A) wird schlafen gelegt!
      await scheduler.enqueueTurn({
        turnId: "t-c",
        agentId: "agent-c",
        provider: "codex",
        execute: async () => "ok",
      });

      expect(sleptAgents).toContain("agent-a");
      expect(scheduler.getAgentState("agent-a")?.isAwake).toBe(false);

      scheduler.dispose();
    });
  });
});
