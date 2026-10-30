import { z } from "zod";

/**
 * Browser-side coworker form contract. Limits match the server parser so validation errors can be
 * shown next to fields before submit.
 */
export const agentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(80, "Name must be 80 characters or fewer."),
  headline: z
    .string()
    .trim()
    .max(120, "Headline must be 120 characters or fewer.")
    .optional()
    .nullable(),
  role: z
    .string()
    .trim()
    .max(100, "Role must be 100 characters or fewer.")
    .optional()
    .nullable(),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be 2000 characters or fewer.")
    .optional()
    .nullable(),
  avatarUrl: z.string().optional().nullable(),
  title: z
    .string()
    .trim()
    .max(120, "Title must be 120 characters or fewer.")
    .optional()
    .default(""),
  roleDescription: z
    .string()
    .trim()
    .max(2000, "Role description must be 2000 characters or fewer.")
    .optional()
    .default(""),
  visibility: z.enum(["public", "private"]),
  /**
   * The AG-UI endpoint this coworker runs on. Empty means the Bot in the box.
   *
   * Only URL shape is checked here; deployment allow/deny rules are server-side.
   */
  endpoint: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^https?:\/\/\S+$/.test(value),
      "Enter a web address starting with http:// or https://.",
    ),
  /**
   * A key the agent sits behind. WRITE-ONLY: it is never sent back from the server, so this field is
   * always empty when editing, and leaving it empty keeps whatever key is already set.
   */
  authValue: z.string(),
  /**
   * Stufe 1.1+: CLI-Engine für diesen Agent.
   * Wenn nicht gesetzt (undefined), nutzt der Agent das lokale Modell.
   * Stufe 4: Erweitert um "freebuff" (npm i -g freebuff).
   */
  cliEngineKind: z.enum(["antigravity", "codex", "claude", "freebuff"]).nullable(),
  cliEngineModel: z.string().max(80),
  cliEngineAllowWrite: z.boolean(),
  /**
   * Stufe 2 Phase C: Browser-Profile-Engine.
   */
  browserProfileEnabled: z.boolean(),
  browserProfileStartUrl: z
    .string()
    .max(500)
    .refine(
      (v) => v === "" || /^https?:\/\//.test(v),
      "Ungültige URL",
    ),
  browserProfileAllowWrite: z.boolean(),
  /**
   * Stufe 4: Freebuff-Engine (eigener Block — Modell wird in die
   * ~/.config/manicode/settings.json geschrieben, nicht per CLI-Flag).
   */
  freebuffEnabled: z.boolean(),
  freebuffModel: z.string().max(80),
  freebuffAllowWrite: z.boolean(),
  /**
   * Stufe 3: Manus-Cloud-Engine.
   */
  manusEnabled: z.boolean(),
  manusModel: z.string().max(80),
  manusProfileName: z.string().max(120),
  /**
   * Stufe 3: browser-use Sidecar-Engine.
   */
  browserUseEnabled: z.boolean(),
  browserUseStartUrl: z
    .string()
    .max(500)
    .refine(
      (v) => v === "" || /^https?:\/\//.test(v),
      "Ungültige URL",
    ),
  browserUseAllowWrite: z.boolean(),
  /**
   * Phase B Schritt 9: Eigenes Konto pro Bot.
   * Jeder Agent bekommt ein eigenes CLI-Konto mit eigenem Config-Verzeichnis.
   * Die eingeloggte E-Mail wird am Agenten gespeichert und angezeigt.
   */
  accountEmail: z.string().email("Ungültige E-Mail-Adresse").or(z.literal("")).nullable(),
  accountDisplayName: z.string().max(120).nullable(),
  skills: z.array(z.any()).optional().nullable(),
  // Phase C Schritt 13: Webseiten-Liste
  websiteList: z.array(z.any()).optional().nullable(),
  // Phase C Schritt 14: Subagenten (Online-KIs)
  subagents: z.array(z.any()).optional().nullable(),
  chosenCli: z.string().max(80).optional().nullable(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;

export const emptyAgentForm: AgentFormValues = {
  name: "",
  headline: "",
  role: "",
  description: "",
  avatarUrl: "",
  title: "",
  roleDescription: "",
  visibility: "private",
  endpoint: "",
  authValue: "",
  cliEngineKind: null as "antigravity" | "codex" | "claude" | "freebuff" | null,
  cliEngineModel: "auto",
  cliEngineAllowWrite: false,
  browserProfileEnabled: false,
  browserProfileStartUrl: "",
  browserProfileAllowWrite: false,
  freebuffEnabled: false,
  freebuffModel: "auto",
  freebuffAllowWrite: false,
  manusEnabled: false,
  manusModel: "auto",
  manusProfileName: "",
  browserUseEnabled: false,
  browserUseStartUrl: "",
  browserUseAllowWrite: false,
  // Phase B Schritt 9: Eigenes Konto pro Bot
  accountEmail: null,
  accountDisplayName: null,
  // Phase C Schritt 10: Skills
  skills: null,
  // Phase C Schritt 13: Webseiten
  websiteList: null,
  // Phase C Schritt 14: Subagenten
  subagents: null,
  chosenCli: null,
};

/** Convert form values to API input; omit an empty key so editing preserves the current credential. */
export function agentInputFrom(values: AgentFormValues) {
  // Connect bots always run on the local deployment Bot — never dial a remote AG-UI endpoint.
  // Visibility is always private: Public and Private in any older client both land as private.
  const headline = values.headline?.trim() || values.title?.trim() || "";
  const role = values.role?.trim() || "";
  const description = values.description?.trim() || values.roleDescription?.trim() || "";
  const title = headline || values.name;
  const roleDescription = description || role || values.name;

  return {
    name: values.name,
    title,
    roleDescription,
    visibility: "private" as const,
    endpoint: "",
    ...(headline ? { headline } : {}),
    ...(role ? { role } : {}),
    ...(description ? { description } : {}),
    ...(values.avatarUrl ? { avatarUrl: values.avatarUrl } : {}),
    // Stufe 1.1: CLI-Engine. Wenn nicht gesetzt, läuft der Agent auf dem lokalen Modell.
    ...(values.cliEngineKind
      ? {
          cliEngine: {
            kind: values.cliEngineKind,
            model: values.cliEngineModel || "auto",
            allowWrite: values.cliEngineAllowWrite,
          },
        }
      : {}),
    // Stufe 2 Phase C: Browser-Profile-Engine.
    ...(values.browserProfileEnabled && values.browserProfileStartUrl
      ? {
          browserProfile: {
            kind: "browser_profile" as const,
            startUrl: values.browserProfileStartUrl,
            profileName: "",
            allowWrite: values.browserProfileAllowWrite,
          },
        }
      : {}),
    // Stufe 4: Freebuff-Engine.
    ...(values.freebuffEnabled
      ? {
          freebuffEngine: {
            kind: "freebuff" as const,
            model: values.freebuffModel || "auto",
            allowWrite: values.freebuffAllowWrite,
          },
        }
      : {}),
    // Stufe 3: Manus-Cloud-Engine.
    ...(values.manusEnabled
      ? {
          manusEngine: {
            kind: "manus" as const,
            model: values.manusModel || "auto",
            ...(values.manusProfileName ? { profileName: values.manusProfileName } : {}),
          },
        }
      : {}),
    // Stufe 3: browser-use Sidecar-Engine.
    ...(values.browserUseEnabled
      ? {
          browserUseEngine: {
            kind: "browser_use" as const,
            ...(values.browserUseStartUrl ? { startUrl: values.browserUseStartUrl } : {}),
            allowWrite: values.browserUseAllowWrite,
          },
        }
      : {}),
    // Phase B Schritt 9: Eigenes Konto pro Bot
    ...(values.accountEmail !== undefined
      ? {
          accountEmail: values.accountEmail || null,
          accountDisplayName: values.accountDisplayName || null,
        }
      : {}),
    // Phase C Schritt 10: Skills
    ...(values.skills !== undefined && values.skills !== null
      ? {
          skills: values.skills,
        }
      : {}),
    // Phase C Schritt 13: Webseiten-Liste
    ...(values.websiteList !== undefined && values.websiteList !== null
      ? {
          websiteList: values.websiteList,
        }
      : {}),
    // Phase C Schritt 14: Subagenten (Online-KIs)
    ...(values.subagents !== undefined && values.subagents !== null
      ? {
          subagents: values.subagents,
        }
      : {}),
    // Standard-CLI des Agenten (z.B. freebuff, codex, claude, antigravity, hermes)
    ...(values.chosenCli
      ? { chosenCli: values.chosenCli }
      : values.cliEngineKind
        ? { chosenCli: values.cliEngineKind }
        : {}),
  };
}
