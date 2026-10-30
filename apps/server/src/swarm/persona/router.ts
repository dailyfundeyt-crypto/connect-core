import { Hono } from "hono";
import { PersonaService } from "./persona-service";
import { PersonaPromptBuilder } from "./prompt-builder";
import { AgentPersonaSchema } from "../../contracts/swarm-v3";

export function createPersonaRouter(): Hono {
  const router = new Hono();

  // GET /api/personas - list all personas
  router.get("/", async (c) => {
    try {
      const personas = await PersonaService.listPersonas();
      return c.json({ success: true, personas }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Laden der Personas" }, 500);
    }
  });

  // POST /api/personas/generate - propose persona from agent profile + notes
  router.post("/generate", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as any;
      const agentProfile = body.agentProfile || body;
      const notes = Array.isArray(body.notes) ? body.notes : [];
      if (!agentProfile?.id) {
        return c.json({ success: false, error: "agentProfile.id erforderlich" }, 400);
      }
      const suggested = PersonaService.generatePersona(agentProfile, notes);
      return c.json({ success: true, persona: suggested }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Generieren der Persona" }, 500);
    }
  });

  // POST /api/personas/context - build persona prompt context
  router.post("/context", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as any;
      const agentId = body.agentId;
      const topic = body.topic || "Allgemeine Strategie";
      if (!agentId) {
        return c.json({ success: false, error: "agentId erforderlich" }, 400);
      }
      const context = await PersonaPromptBuilder.buildPersonaContext(agentId, topic, {
        maxTokens: body.maxTokens,
        kMemories: body.kMemories,
        kKnowledgeChunks: body.kKnowledgeChunks,
      });
      return c.json({ success: true, context }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Erstellen des Kontexts" }, 500);
    }
  });

  // POST /api/personas/turn - generate persona response turn
  router.post("/turn", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as any;
      const agentId = body.agentId;
      const query = body.query || body.topic || "Wie gewinne ich günstig Kunden?";
      if (!agentId) {
        return c.json({ success: false, error: "agentId erforderlich" }, 400);
      }
      const result = await PersonaPromptBuilder.generatePersonaResponse(agentId, query);
      return c.json({ success: true, ...result }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Generieren des Turns" }, 500);
    }
  });

  // GET /api/personas/:agentId - get single persona
  router.get("/:agentId", async (c) => {
    try {
      const agentId = c.req.param("agentId");
      const persona = await PersonaService.getPersona(agentId);
      if (!persona) {
        return c.json({ success: false, error: `Persona für Agent ${agentId} nicht gefunden` }, 404);
      }
      return c.json({ success: true, persona }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Laden der Persona" }, 500);
    }
  });

  // POST /api/personas - create or update persona
  router.post("/", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = AgentPersonaSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Persona-Daten", issues: parsed.error.issues }, 400);
      }
      const saved = await PersonaService.savePersona(parsed.data);
      return c.json({ success: true, persona: saved }, 201);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Speichern der Persona" }, 500);
    }
  });

  // PUT /api/personas/:agentId - update persona
  router.put("/:agentId", async (c) => {
    try {
      const agentId = c.req.param("agentId");
      const body = await c.req.json().catch(() => ({}));
      const payload = { ...body, agentId };
      const parsed = AgentPersonaSchema.safeParse(payload);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Persona-Daten", issues: parsed.error.issues }, 400);
      }
      const saved = await PersonaService.savePersona(parsed.data);
      return c.json({ success: true, persona: saved }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Aktualisieren der Persona" }, 500);
    }
  });

  // DELETE /api/personas/:agentId - delete persona
  router.delete("/:agentId", async (c) => {
    try {
      const agentId = c.req.param("agentId");
      await PersonaService.deletePersona(agentId);
      return c.json({ success: true, message: `Persona für Agent ${agentId} gelöscht` }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Löschen der Persona" }, 500);
    }
  });

  return router;
}

export default createPersonaRouter;
