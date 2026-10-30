import { Hono } from "hono";
import { CouncilEngine } from "./council-engine";
import { CouncilChair } from "./chair";
import { ScaleStefanTemplate } from "./templates/scale-stefan";
import { councilEvents } from "./events";
import {
  CreateCouncilSessionRequestSchema,
  SubmitCouncilTurnRequestSchema,
  SubmitCouncilVoteRequestSchema,
} from "../../contracts/swarm-v3/index";

export function createCouncilRouter(): Hono {
  const router = new Hono();

  // 1. Health check
  router.get("/health", (c) => {
    return c.json({
      status: "ok",
      module: "council",
      lane: "Lane 6 (Roast-Room Council Engine)",
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Chair-Analysis endpoint for any ad-hoc question
  router.post("/chair/analyze", async (c) => {
    try {
      const body = await c.req.json();
      const question = String(body.question || "").trim();
      const options = Array.isArray(body.options) ? body.options : [];
      const context = body.context ? String(body.context) : undefined;

      const analysis = CouncilChair.analyzeDebateReadiness(question, options, context);
      return c.json({ success: true, analysis });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 400);
    }
  });

  // 3. List Sessions
  router.get("/sessions", (c) => {
    const sessions = CouncilEngine.listSessions();
    return c.json({ success: true, sessions });
  });

  // 4. Create Session
  router.post("/sessions", async (c) => {
    try {
      const body = await c.req.json();
      const validated = CreateCouncilSessionRequestSchema.parse(body);

      const stringOptions = Array.isArray(validated.options)
        ? validated.options.map((o) => (typeof o === "string" ? o : JSON.stringify(o)))
        : [];

      const seats = validated.seatAgentIds?.map((id) => ({ agentId: id }));

      const result = await CouncilEngine.createSession({
        question: validated.question,
        options: stringOptions,
        context: validated.context,
        mode: validated.mode,
        seats,
      });

      return c.json({
        success: true,
        session: result.session,
        seats: result.seats,
        chairQuestions: result.chairQuestions,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 400);
    }
  });

  // 5. Get Session Details
  router.get("/sessions/:id", (c) => {
    const sessionId = c.req.param("id");
    const session = CouncilEngine.getSession(sessionId);
    if (!session) {
      return c.json({ success: false, error: `Session '${sessionId}' nicht gefunden.` }, 404);
    }

    const seats = CouncilEngine.getSeats(sessionId);
    const turns = CouncilEngine.getTurns(sessionId);
    const votes = CouncilEngine.getVotes(sessionId);
    const decision = CouncilEngine.getDecision(sessionId);

    return c.json({
      success: true,
      session,
      seats,
      turns,
      votes,
      decision,
    });
  });

  // 6. Submit Turn
  router.post("/sessions/:id/turns", async (c) => {
    try {
      const sessionId = c.req.param("id");
      const body = await c.req.json();
      const validated = SubmitCouncilTurnRequestSchema.parse({
        ...body,
        sessionId,
      });

      const turn = CouncilEngine.addTurn({
        sessionId,
        round: validated.round,
        agentId: validated.agentId,
        content: validated.content,
        stance: validated.stance,
        timestamp: new Date().toISOString(),
      });

      return c.json({ success: true, turn });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 400);
    }
  });

  // 7. Submit Vote
  router.post("/sessions/:id/votes", async (c) => {
    try {
      const sessionId = c.req.param("id");
      const body = await c.req.json();
      const validated = SubmitCouncilVoteRequestSchema.parse({
        ...body,
        sessionId,
      });

      const vote = CouncilEngine.addVote({
        sessionId,
        agentId: validated.agentId,
        option: validated.option,
        score: validated.score,
        weight: validated.weight,
        ruinFlag: validated.ruinFlag,
        rationale: validated.rationale,
      });

      return c.json({ success: true, vote });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 400);
    }
  });

  // 8. Run Debate / Session
  router.post("/sessions/:id/run", async (c) => {
    try {
      const sessionId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const provider = body.provider || "gemini-cli";
      const forceDevilsAdvocate = Boolean(body.forceDevilsAdvocate);

      const result = await CouncilEngine.runSession(sessionId, {
        provider,
        forceDevilsAdvocate,
      });

      return c.json({
        success: true,
        session: result.session,
        turnsCount: result.turns.length,
        votesCount: result.votes.length,
        decision: result.decision,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // 9. Get Verdict / ADR Decision Record
  router.get("/sessions/:id/verdict", (c) => {
    const sessionId = c.req.param("id");
    const decision = CouncilEngine.getDecision(sessionId);
    if (!decision) {
      return c.json({ success: false, error: `Kein Decision Record für Session '${sessionId}' vorhanden.` }, 404);
    }

    const format = c.req.query("format");
    if (format === "markdown" || format === "md") {
      return c.text(decision.recordMd, 200, {
        "content-type": "text/markdown; charset=utf-8",
      });
    }

    return c.json({ success: true, decision });
  });

  // 10. Server-Sent Events (SSE) Stream
  router.get("/sessions/:id/events", (c) => {
    const sessionId = c.req.param("id");
    const session = CouncilEngine.getSession(sessionId);
    if (!session) {
      return c.json({ success: false, error: `Session '${sessionId}' existiert nicht.` }, 404);
    }

    let cleanup: (() => void) | null = null;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Send initial connect ping
        controller.enqueue(
          encoder.encode(
            `event: connected\ndata: ${JSON.stringify({ sessionId, status: session.status, timestamp: new Date().toISOString() })}\n\n`
          )
        );

        cleanup = councilEvents.subscribeToSession(sessionId, (payload) => {
          try {
            const chunk = `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // Stream closed
          }
        });
      },
      cancel() {
        if (cleanup) {
          cleanup();
          cleanup = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-cache",
        "connection": "keep-alive",
      },
    });
  });

  // 11. Templates Listing
  router.get("/templates", (c) => {
    return c.json({
      success: true,
      templates: [ScaleStefanTemplate.getTemplateDefinition()],
    });
  });

  // 12. Run scale-stefan template directly
  router.post("/templates/scale-stefan/run", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const result = await ScaleStefanTemplate.execute({
        simulationReportSummary: body.simulationReportSummary,
        sparkPlanFileIds: body.sparkPlanFileIds,
        customQuestion: body.customQuestion,
        customOptions: body.customOptions,
        mode: body.mode || "quick",
        provider: body.provider || "mock",
      });

      return c.json({
        success: true,
        session: result.session,
        seats: result.seats,
        turns: result.turns,
        votes: result.votes,
        decision: result.decision,
        citationsCount: result.citations.length,
        citations: result.citations,
        sparkFolderId: result.sparkFolderId,
        sparkNoteId: result.sparkNoteId,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  return router;
}

export default createCouncilRouter;
