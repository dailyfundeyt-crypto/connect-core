import { Hono } from "hono";
import { MemoryService } from "./memory-service";
import { CreateMemoryRequestSchema, AgentMemoryType } from "../../contracts/swarm-v3";

export function createMemoryRouter(): Hono {
  const router = new Hono();

  // GET /:agentId/memories - recall memories for agent
  router.get("/:agentId/memories", async (c) => {
    try {
      const agentId = c.req.param("agentId");
      const q = c.req.query("q") || undefined;
      const k = c.req.query("k") ? parseInt(c.req.query("k")!, 10) : 5;
      const type = c.req.query("type") as AgentMemoryType | undefined;
      const minConfidence = c.req.query("minConfidence")
        ? parseFloat(c.req.query("minConfidence")!)
        : undefined;

      const memories = await MemoryService.recall(agentId, q, k, { type, minConfidence });
      return c.json({ success: true, memories }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Abrufen der Erinnerungen" }, 500);
    }
  });

  // POST /:agentId/memories - store a new memory
  router.post("/:agentId/memories", async (c) => {
    try {
      const agentId = c.req.param("agentId");
      const body = await c.req.json().catch(() => ({}));
      const payload = { ...body, agentId };
      const parsed = CreateMemoryRequestSchema.safeParse(payload);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Erinnerungs-Daten", issues: parsed.error.issues }, 400);
      }
      const saved = await MemoryService.remember(parsed.data);
      return c.json({ success: true, memory: saved }, 201);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler beim Speichern der Erinnerung" }, 500);
    }
  });

  // POST /:agentId/memories/reflect - condense episodes into beliefs
  router.post("/:agentId/memories/reflect", async (c) => {
    try {
      const agentId = c.req.param("agentId");
      const createdBeliefs = await MemoryService.reflect(agentId);
      return c.json({ success: true, count: createdBeliefs.length, beliefs: createdBeliefs }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || "Fehler bei der Reflexion" }, 500);
    }
  });

  return router;
}

export default createMemoryRouter;
