/**
 * T3-Bridge — Avatar-Routen (Lane A31).
 *
 * Endpunkte:
 *  - GET /api/agents/:id/avatar
 *    Liest den Avatar. Gibt es noch keinen, wird der aus der ID abgeleitete Standard
 *    zurückgegeben und gespeichert. Wer den Agenten sehen darf, darf den Avatar sehen.
 *  - PUT /api/agents/:id/avatar
 *    Setzt Form, Farbe oder Ausdruck. Nur der Besitzer (oder ein Admin) darf das.
 *
 * Feature-Flag: Hinter `mascot` (A01). Flag aus -> HTTP 404, das alte Verhalten bleibt.
 *
 * Der Router wird von A37 unter `/api/agents` gemountet (siehe Bericht A31).
 */

import { type Context, Hono, type MiddlewareHandler } from "hono";
import { canManageAgent } from "../agents/profile-policy";
import type { AgentProfileStore } from "../agents/profile-store";
import type { AgentActor, AgentProfile } from "../agents/profile-types";
import type { AppVariables } from "../auth/guards";
import { type AgentAvatar, getT3Flag } from "../t3-bridge/contracts";
import { type AgentAvatarService, AvatarValidationError } from "./service";

/**
 * Was die Routen über einen Agenten wissen müssen.
 *
 * Eine eigene schmale Form statt der ganzen `AgentProfileStore`, damit diese Lane nicht an
 * der Profil-API hängt: der Router braucht nur, ob der Agent existiert, ob er sichtbar ist und
 * wer ihn besitzt.
 */
export type AvatarAgentLookup = {
  /** Der Agent, oder null, wenn es ihn nicht gibt oder er für diesen Aufrufer nicht da ist. */
  get(actor: AgentActor, agentId: string): Promise<AgentProfile | null>;
};

export type CreateAgentAvatarRoutesOptions = {
  service: AgentAvatarService;
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>;
  /** Ohne Lookup wird die Existenz des Agenten nicht geprüft. */
  agents?: AvatarAgentLookup | AgentProfileStore;
  /** Nur für Tests: umgeht den Feature-Flag-Guard. */
  enableFlagBypass?: boolean;
};

function toActor(context: Context<{ Variables: AppVariables }>): AgentActor {
  return { id: context.var.actor.id, role: context.var.actor.role };
}

/**
 * Erstellt den Hono-Router für die Avatar-Endpunkte.
 */
export function createAgentAvatarRoutes(
  options: CreateAgentAvatarRoutesOptions,
): Hono<{ Variables: AppVariables }> {
  const router = new Hono<{ Variables: AppVariables }>();
  const service = options.service;

  const flagGuard: MiddlewareHandler = async (c, next) => {
    const active =
      options.enableFlagBypass || getT3Flag("mascot") || getT3Flag("bridge");
    if (!active) {
      return c.json({ error: "Feature not found" }, 404);
    }
    return next();
  };

  router.use("*", options.requireUser);
  router.use("*", flagGuard);

  /**
   * Liest den Avatar eines Agenten.
   *
   * Wer den Agenten sehen darf, darf auch seinen Avatar sehen: der Avatar ist keine
   * Zusatzinformation, sondern das Gesicht, das neben dem Namen steht.
   */
  router.get("/:agentId/avatar", async (context) => {
    const agentId = context.req.param("agentId")?.trim();
    if (!agentId) {
      return context.json({ error: "A Bot id is required." }, 400);
    }

    if (options.agents) {
      const agent = await options.agents.get(toActor(context), agentId);
      if (!agent) {
        return context.json({ error: "Agent not found." }, 404);
      }
    }

    const avatar = await service.get(agentId);
    return context.json(avatar satisfies AgentAvatar);
  });

  /**
   * Setzt den Avatar eines Agenten.
   *
   * Nur der Besitzer darf das. Ein Bot, den ein Admin angelegt hat, gehört diesem Admin, und
   * ein fremder Bot ist nicht plötzlich umgestaltet, weil jemand die ID kannte.
   */
  router.put("/:agentId/avatar", async (context) => {
    const agentId = context.req.param("agentId")?.trim();
    if (!agentId) {
      return context.json({ error: "A Bot id is required." }, 400);
    }

    const body = (await context.req.json().catch(() => null)) as {
      shape?: unknown;
      color?: unknown;
      expression?: unknown;
    } | null;

    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return context.json({ error: "Invalid JSON payload." }, 400);
    }

    const wantsRandom = (body as { random?: unknown }).random === true;

    if (options.agents) {
      const agent = await options.agents.get(toActor(context), agentId);
      if (!agent) {
        return context.json({ error: "Agent not found." }, 404);
      }
      if (!canManageAgent(toActor(context), agent)) {
        return context.json(
          { error: "Only the owner of this Bot may change its avatar." },
          403,
        );
      }
    }

    try {
      const avatar = wantsRandom
        ? await service.assignRandom(agentId)
        : await service.set(agentId, {
            shape: body.shape,
            color: body.color,
            expression: body.expression,
          });
      return context.json(avatar satisfies AgentAvatar);
    } catch (error) {
      if (error instanceof AvatarValidationError) {
        return context.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  return router;
}

export default createAgentAvatarRoutes;
