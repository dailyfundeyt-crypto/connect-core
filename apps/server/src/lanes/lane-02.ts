import type { Hono as HonoApp } from "hono";
import { ThemePrefSchema, EXTERNAL_LINKS, ROUTES } from "../contracts";
import { registerCompanyAppsRoutes } from "../companies/company-apps";

interface StoredPreferences {
  theme: "dark" | "light" | "system";
  accentColor?: string;
  focusMode?: boolean;
  reducedMotion?: boolean;
}

// In-memory preference store with standard dark theme default
let userPreferences: StoredPreferences = {
  theme: "dark",
  focusMode: false,
  reducedMotion: false,
};

/**
 * Lane 02: Focus-Modus, Firmenverwaltung, Grok-Bot, Theme Preferences
 */
export function registerLane02Routes(app: HonoApp<any, any, any>): void {
  // GET /api/user/preferences - retrieve theme & UI preferences
  app.get("/api/user/preferences", (c) => {
    return c.json({
      success: true,
      preferences: userPreferences,
    });
  });

  // PATCH /api/user/preferences - update theme & UI preferences
  app.patch("/api/user/preferences", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = ThemePrefSchema.partial().safeParse(body);

      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: "Ungültige Einstellungen",
            issues: parsed.error.issues,
          },
          400,
        );
      }

      userPreferences = {
        ...userPreferences,
        ...parsed.data,
      };

      return c.json({
        success: true,
        preferences: userPreferences,
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || "Fehler beim Speichern der Einstellungen",
        },
        500,
      );
    }
  });

  // Focus Canonical Steps Configuration Endpoint
  app.get("/api/focus/config", (c) => {
    return c.json({
      success: true,
      focusSteps: [
        { id: "plan", name: "Planung", task: "Pläne in Docs schreiben (Plan-Modus)" },
        { id: "datenbank", name: "Datenbank", task: "Dateien in der Datenbank wählen" },
        {
          id: "aufgaben",
          name: "Aufgabenzuweisung",
          task: "Grok Bot gibt den anderen Agenten die Aufträge",
          url: EXTERNAL_LINKS.grokBot,
        },
        { id: "email", name: "E-Mails", task: "E-Mail, um zu überprüfen, ob die Aufträge erfüllt sind" },
      ],
      hiddenSteps: ["agenten"],
      externalLinks: {
        grokBot: EXTERNAL_LINKS.grokBot,
      },
      routes: {
        socialCompany: ROUTES.socialCompany,
        settingsCompanies: ROUTES.settingsCompanies,
      },
    });
  });

  // Swarm-v3 Lane 2: Unternehmens-Apps pro Firma (/api/companies/:id/apps)
  registerCompanyAppsRoutes(app);
}

export default registerLane02Routes;
