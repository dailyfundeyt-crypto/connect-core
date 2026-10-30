import type { Hono as HonoApp } from "hono";
import postgres from "postgres";
import { OnboardingStateSchema, type OnboardingState } from "../contracts/api";
import {
  createRateLimiter,
  createSecurityHeaders,
  createCorsAndCsrfCheck,
} from "../auth/security";

function getSql() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is not set");
  return postgres(dbUrl, { max: 2, idle_timeout: 3 });
}

async function resolveUserId(c: any, sql: any): Promise<string> {
  // 1. From context var actor if available
  const actor = c.var?.actor;
  if (actor?.id) {
    return actor.id;
  }

  // 2. From query param or header (useful for onboarding & testing)
  const queryUser = c.req.query("userId");
  if (queryUser) {
    return queryUser;
  }
  const headerUser = c.req.header("x-user-id");
  if (headerUser) {
    return headerUser;
  }

  // 3. From session cookie
  const cookieHeader = c.req.header("Cookie") || "";
  const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/) ||
                cookieHeader.match(/connect\.session_token=([^;]+)/);
  if (match && match[1]) {
    try {
      const rows = await sql`
        SELECT user_id FROM sessions
        WHERE id = ${match[1]} AND expires_at > now()
        LIMIT 1
      `;
      if (rows && rows.length > 0 && rows[0].user_id) {
        return rows[0].user_id;
      }
    } catch {
      // Fallback below
    }
  }

  // 4. Default to first active user or dev-local-user
  try {
    const defaultUserRows = await sql`
      SELECT id FROM users ORDER BY created_at ASC LIMIT 1
    `;
    if (defaultUserRows && defaultUserRows.length > 0) {
      return defaultUserRows[0].id;
    }
  } catch {
    // Fallback
  }

  return "dev-local-user";
}

/**
 * Lane 09: Onboarding & Security Infrastructure
 */
export function registerLane09Routes(app: HonoApp<any, any, any>): void {
  // 1. Global Security Middleware
  app.use("/api/*", createSecurityHeaders());
  app.use("/api/*", createCorsAndCsrfCheck());
  app.use("/api/*", createRateLimiter({ max: 150, windowMs: 60_000 }));

  // 2. /api/onboarding/state (GET)
  app.get("/api/onboarding/state", async (c) => {
    const sql = getSql();
    try {
      const userId = await resolveUserId(c, sql);
      const rows = await sql`
        SELECT user_id, step, completed_steps, is_completed, theme_preference, active_company_id, data, updated_at
        FROM onboarding_state
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      if (rows && rows.length > 0) {
        const row = rows[0];
        const state: OnboardingState = {
          userId: row.user_id,
          step: row.step || "welcome",
          completedSteps: Array.isArray(row.completed_steps) ? row.completed_steps : [],
          isCompleted: Boolean(row.is_completed),
          themePreference: (row.theme_preference as any) || "dark",
          activeCompanyId: row.active_company_id || undefined,
          data: typeof row.data === "object" && row.data !== null ? row.data : {},
          updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date().toISOString(),
        };
        return c.json(state);
      }

      // Default state
      const defaultState: OnboardingState = {
        userId,
        step: "welcome",
        completedSteps: [],
        isCompleted: false,
        themePreference: "dark",
        data: {},
        updatedAt: new Date().toISOString(),
      };
      return c.json(defaultState);
    } catch (err: any) {
      console.error("[Lane09] Error fetching onboarding state:", err);
      return c.json({ error: "Failed to fetch onboarding state", details: err?.message }, 500);
    } finally {
      await sql.end({ timeout: 1 });
    }
  });

  // Helper for patching state
  const handlePatchState = async (c: any) => {
    const sql = getSql();
    try {
      const userId = await resolveUserId(c, sql);
      const body = await c.req.json().catch(() => ({}));

      const step = typeof body.step === "string" ? body.step : "welcome";
      const completedSteps = Array.isArray(body.completedSteps) ? JSON.stringify(body.completedSteps) : "[]";
      const isCompleted = typeof body.isCompleted === "boolean" ? body.isCompleted : false;
      const themePreference = typeof body.themePreference === "string" ? body.themePreference : null;
      const activeCompanyId = typeof body.activeCompanyId === "string" ? body.activeCompanyId : null;
      const data = typeof body.data === "object" && body.data !== null ? JSON.stringify(body.data) : "{}";

      const rows = await sql`
        INSERT INTO onboarding_state (
          user_id, step, completed_steps, is_completed, theme_preference, active_company_id, data, updated_at
        )
        VALUES (
          ${userId},
          ${step},
          ${completedSteps}::jsonb,
          ${isCompleted},
          ${themePreference},
          ${activeCompanyId},
          ${data}::jsonb,
          now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
          step = EXCLUDED.step,
          completed_steps = EXCLUDED.completed_steps,
          is_completed = EXCLUDED.is_completed,
          theme_preference = COALESCE(EXCLUDED.theme_preference, onboarding_state.theme_preference),
          active_company_id = COALESCE(EXCLUDED.active_company_id, onboarding_state.active_company_id),
          data = COALESCE(EXCLUDED.data, onboarding_state.data),
          updated_at = now()
        RETURNING user_id, step, completed_steps, is_completed, theme_preference, active_company_id, data, updated_at
      `;

      if (isCompleted) {
        // Also sync to users table
        await sql`
          UPDATE users
          SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
              updated_at = now()
          WHERE id = ${userId}
        `;
      }

      const row = rows[0];
      const state: OnboardingState = {
        userId: row.user_id,
        step: row.step,
        completedSteps: Array.isArray(row.completed_steps) ? row.completed_steps : [],
        isCompleted: Boolean(row.is_completed),
        themePreference: (row.theme_preference as any) || undefined,
        activeCompanyId: row.active_company_id || undefined,
        data: typeof row.data === "object" && row.data !== null ? row.data : {},
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date().toISOString(),
      };

      return c.json(state);
    } catch (err: any) {
      console.error("[Lane09] Error updating onboarding state:", err);
      return c.json({ error: "Failed to update onboarding state", details: err?.message }, 500);
    } finally {
      await sql.end({ timeout: 1 });
    }
  };

  // 3. /api/onboarding/state (PATCH & POST)
  app.patch("/api/onboarding/state", handlePatchState);
  app.post("/api/onboarding/state", handlePatchState);
}

export default registerLane09Routes;
