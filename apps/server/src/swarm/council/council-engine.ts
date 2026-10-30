import { randomUUID } from "node:crypto";
import type {
  CouncilSession,
  CouncilSeat,
  CouncilTurn,
  CouncilVote,
  DecisionRecord,
  LlmProvider,
} from "./types";
import { CouncilChair } from "./chair";
import { AntiGroupthinkEngine } from "./anti-groupthink";
import { CouncilScoringEngine } from "./scoring";
import { CouncilDecisionRecordGenerator } from "./decision-record";
import { councilEvents } from "./events";
import { PersonaPromptBuilder } from "../persona/prompt-builder";
import { PersonaService } from "../persona/persona-service";
import { MemoryService } from "../memory/memory-service";
import { runCouncilTurn, runCouncilVote } from "../adapters/council-adapter";
import { mockCouncilSessions, mockCouncilSeats, mockCouncilTurns, mockCouncilVotes, mockDecisionRecord } from "../../contracts/swarm-v3/mocks";

export class CouncilEngine {
  private static sessions = new Map<string, CouncilSession>();
  private static seats = new Map<string, CouncilSeat[]>();
  private static turns = new Map<string, CouncilTurn[]>();
  private static votes = new Map<string, CouncilVote[]>();
  private static decisions = new Map<string, DecisionRecord>();

  // Pre-seed mock data
  static {
    for (const s of mockCouncilSessions) {
      this.sessions.set(s.id, { ...s });
    }
    this.seats.set("council_session_scalemodel", [...mockCouncilSeats]);
    this.turns.set("council_session_scalemodel", [...mockCouncilTurns]);
    this.votes.set("council_session_scalemodel", [...mockCouncilVotes]);
    this.decisions.set("council_session_scalemodel", { ...mockDecisionRecord });
  }

  /**
   * Creates a new Council session with automated Chair review.
   */
  public static async createSession(input: {
    question: string;
    options: string[];
    context?: string;
    mode?: "quick" | "full";
    seats?: Array<{ agentId: string; role?: string; weight?: number }>;
  }): Promise<{ session: CouncilSession; seats: CouncilSeat[]; chairQuestions: string[] }> {
    const sessionId = `council_${randomUUID().slice(0, 10)}`;
    const mode = input.mode || "full";
    const cleanOptions = input.options.map((o) => o.trim()).filter(Boolean);

    // Run Chair analysis for missing dimensions
    const analysis = CouncilChair.analyzeDebateReadiness(input.question, cleanOptions, input.context);
    const chairQuestions = analysis.questions.map((q) => q.question);

    const session: CouncilSession = {
      id: sessionId,
      question: input.question,
      options: cleanOptions,
      context: input.context,
      mode,
      status: "pending",
      chairQuestions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Determine seats
    let chosenSeats: CouncilSeat[] = [];
    if (input.seats && input.seats.length > 0) {
      chosenSeats = input.seats.map((s) => ({
        sessionId,
        agentId: s.agentId,
        role: s.role || "Council Member",
        weight: s.weight ?? 1.0,
      }));
    } else {
      chosenSeats = analysis.recommendedSeats.map((rec) => ({
        sessionId,
        agentId: rec.agentId,
        role: rec.role,
        weight: rec.weight,
      }));
    }

    this.sessions.set(sessionId, session);
    this.seats.set(sessionId, chosenSeats);
    this.turns.set(sessionId, []);
    this.votes.set(sessionId, []);

    councilEvents.emitEvent({
      type: "session_created",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { session, seatsCount: chosenSeats.length },
    });

    return { session, seats: chosenSeats, chairQuestions };
  }

  public static getSession(sessionId: string): CouncilSession | null {
    return this.sessions.get(sessionId) || null;
  }

  public static listSessions(): CouncilSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  public static getSeats(sessionId: string): CouncilSeat[] {
    return this.seats.get(sessionId) || [];
  }

  public static getTurns(sessionId: string): CouncilTurn[] {
    return this.turns.get(sessionId) || [];
  }

  public static getVotes(sessionId: string): CouncilVote[] {
    return this.votes.get(sessionId) || [];
  }

  public static getDecision(sessionId: string): DecisionRecord | null {
    return this.decisions.get(sessionId) || null;
  }

  /**
   * Submits a single turn manually or from external agent.
   */
  public static addTurn(turn: CouncilTurn): CouncilTurn {
    const list = this.turns.get(turn.sessionId) || [];
    list.push(turn);
    this.turns.set(turn.sessionId, list);

    councilEvents.emitEvent({
      type: "turn_complete",
      sessionId: turn.sessionId,
      round: turn.round,
      agentId: turn.agentId,
      timestamp: new Date().toISOString(),
      data: { turn },
    });

    return turn;
  }

  /**
   * Submits a single vote.
   */
  public static addVote(vote: CouncilVote): CouncilVote {
    const list = this.votes.get(vote.sessionId) || [];
    list.push(vote);
    this.votes.set(vote.sessionId, list);

    councilEvents.emitEvent({
      type: "vote_complete",
      sessionId: vote.sessionId,
      agentId: vote.agentId,
      timestamp: new Date().toISOString(),
      data: { vote },
    });

    return vote;
  }

  /**
   * Runs the automated debate protocol through rounds, anti-groupthink, voting,
   * verdict generation, reflection memory, and Spark storage.
   */
  public static async runSession(
    sessionId: string,
    options: { provider?: LlmProvider; forceDevilsAdvocate?: boolean } = {}
  ): Promise<{
    session: CouncilSession;
    turns: CouncilTurn[];
    votes: CouncilVote[];
    decision: DecisionRecord;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' existiert nicht.`);
    }

    const seats = this.seats.get(sessionId) || [];
    if (seats.length === 0) {
      throw new Error(`Session '${sessionId}' hat keine zugewiesenen Council-Seats.`);
    }

    session.status = "in_progress";
    session.updatedAt = new Date().toISOString();
    const provider = options.provider || "gemini-cli";
    const turns = this.turns.get(sessionId) || [];
    const votes = this.votes.get(sessionId) || [];

    const stringOptions = Array.isArray(session.options)
      ? session.options.map((o) => (typeof o === "string" ? o : JSON.stringify(o)))
      : ["Option A", "Option B"];

    // =========================================================================
    // ROUND 1: Opening Statements
    // =========================================================================
    councilEvents.emitEvent({
      type: "round_start",
      sessionId,
      round: 1,
      timestamp: new Date().toISOString(),
      data: { roundName: "Eröffnungsplädoyers" },
    });

    for (const seat of seats) {
      // Build persona context from Lane 5
      const personaCtx = await PersonaPromptBuilder.buildPersonaContext(seat.agentId, session.question);
      const turn = await runCouncilTurn({
        session,
        seat,
        round: 1,
        persona: personaCtx.persona,
        previousTurns: turns,
        provider,
      });
      turns.push(turn);
      this.turns.set(sessionId, turns);

      councilEvents.emitEvent({
        type: "turn_complete",
        sessionId,
        round: 1,
        agentId: seat.agentId,
        timestamp: new Date().toISOString(),
        data: { turn },
      });
    }

    // =========================================================================
    // Check Anti-Groupthink Consensus
    // =========================================================================
    const groupthink = AntiGroupthinkEngine.evaluateConsensus(turns, seats, 1);
    const triggerDevils = options.forceDevilsAdvocate || groupthink.triggered;

    if (triggerDevils) {
      const adversaryId = groupthink.assignedAgentId || "agent_skeptic_ruin";
      const adversarySeat = seats.find((s) => s.agentId === adversaryId) || seats[0];

      councilEvents.emitEvent({
        type: "devils_advocate_triggered",
        sessionId,
        round: 2,
        agentId: adversarySeat.agentId,
        timestamp: new Date().toISOString(),
        data: { reason: groupthink.reason || "Erzwungene Devil's-Advocate-Runde zur Echo-Chamber-Vermeidung." },
      });

      const adversaryPersona = await PersonaService.getPersona(adversarySeat.agentId);
      const rawTurn = await runCouncilTurn({
        session: {
          ...session,
          question: `[DEVIL'S ADVOCATE] Zerstöre die optimistischen Annahmen zu: ${session.question}`,
        },
        seat: adversarySeat,
        round: 2,
        persona: adversaryPersona || undefined,
        previousTurns: turns,
        provider,
      });

      const devilsTurn: CouncilTurn = {
        ...rawTurn,
        id: `turn_${sessionId}_devils`,
        isDevilsAdvocate: true,
        stance: "contra_consensus",
      };
      turns.push(devilsTurn);
      this.turns.set(sessionId, turns);

      councilEvents.emitEvent({
        type: "turn_complete",
        sessionId,
        round: 2,
        agentId: adversarySeat.agentId,
        timestamp: new Date().toISOString(),
        data: { turn: devilsTurn },
      });
    }

    // =========================================================================
    // ROUND: Voting & Ruin-Risk Checks
    // =========================================================================
    councilEvents.emitEvent({
      type: "voting_start",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { options: stringOptions },
    });

    votes.length = 0; // Clear previous votes for this run
    for (const seat of seats) {
      const persona = await PersonaService.getPersona(seat.agentId);
      const seatVotes = await runCouncilVote({
        session,
        seat,
        options: stringOptions,
        persona: persona || undefined,
        turns,
        provider,
      });

      votes.push(...seatVotes);
      this.votes.set(sessionId, votes);

      councilEvents.emitEvent({
        type: "vote_complete",
        sessionId,
        agentId: seat.agentId,
        timestamp: new Date().toISOString(),
        data: { votesCount: seatVotes.length },
      });
    }

    // =========================================================================
    // SYNTHESIS: Verdict, Decision Record & Spark Persistence
    // =========================================================================
    const scoring = CouncilScoringEngine.calculateVerdict(session.question, stringOptions, votes, seats);
    const recordMd = CouncilDecisionRecordGenerator.generateRecordMarkdown(
      session,
      seats,
      turns,
      votes,
      scoring
    );

    const decision: DecisionRecord = {
      sessionId,
      verdict: scoring.verdict,
      rationale: scoring.rationale,
      dissent: scoring.dissent,
      confidence: scoring.confidence,
      recordMd,
      createdAt: new Date().toISOString(),
    };

    this.decisions.set(sessionId, decision);
    session.status = "completed";
    session.updatedAt = new Date().toISOString();

    councilEvents.emitEvent({
      type: "decision_synthesized",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { decision },
    });

    // Save to Spark folder 'Entscheidungen'
    const sparkRes = await CouncilDecisionRecordGenerator.saveToSparkDecisionsFolder(
      session,
      decision
    );

    councilEvents.emitEvent({
      type: "spark_saved",
      sessionId,
      timestamp: new Date().toISOString(),
      data: sparkRes,
    });

    // =========================================================================
    // AGENT MEMORY REFLECTION (Lane 5 integration)
    // Each seat remembers its position and the council verdict
    // =========================================================================
    for (const seat of seats) {
      const seatVote = votes.find((v) => v.agentId === seat.agentId);
      const seatTurn = turns.find((t) => t.agentId === seat.agentId);

      try {
        await MemoryService.remember({
          agentId: seat.agentId,
          type: "episodic",
          content: `Council-Debatte zu "${session.question}": Eigene Haltung "${seatTurn?.stance || "neutral"}", Score ${seatVote?.score ?? "N/A"}/10 für "${seatVote?.option ?? "N/A"}". Finaler Beschluss: ${decision.verdict}.`,
          confidence: 0.95,
          metadata: {
            sessionId,
            verdict: decision.verdict,
            ruinFlag: seatVote?.ruinFlag ?? false,
          },
        });
      } catch (err) {
        console.warn(`[CouncilEngine] Memory remember fallback for ${seat.agentId}:`, err);
      }
    }

    councilEvents.emitEvent({
      type: "memory_recorded",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { recordedSeats: seats.length },
    });

    return {
      session,
      turns,
      votes,
      decision,
    };
  }
}
