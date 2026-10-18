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
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(120, "Title must be 120 characters or fewer."),
  roleDescription: z
    .string()
    .trim()
    .min(1, "Role description is required.")
    .max(1000, "Role description must be 1000 characters or fewer."),
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
  browserProfileStartUrl: z.string().url("Ungültige URL").or(z.literal("")).max(500),
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
  browserUseStartUrl: z.string().url("Ungültige URL").or(z.literal("")).max(500),
  browserUseAllowWrite: z.boolean(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;

export const emptyAgentForm: AgentFormValues = {
  name: "",
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
};

/** Convert form values to API input; omit an empty key so editing preserves the current credential. */
export function agentInputFrom(values: AgentFormValues) {
  // Connect bots always run on the local deployment Bot — never dial a remote AG-UI endpoint.
  // Visibility is always private: Public and Private in any older client both land as private.
  return {
    name: values.name,
    title: values.title,
    roleDescription: values.roleDescription,
    visibility: "private" as const,
    endpoint: "",
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
  };
}
