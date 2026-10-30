/**
 * Connect Desktop / Hitodama-Features Contracts (Lane 0)
 *
 * Single source of truth for:
 * 1. Windows Named Pipe JSON-RPC (\\.\pipe\connect-desktop)
 * 2. Desktop Actions (open_app, open_url, find_element, click, type_text, key_combo, scroll, read_screen_text, screenshot)
 * 3. Connect Server API (/api/desktop/*) with local token authentication
 * 4. Connect MCP Tool specifications (desktop.*)
 * 5. Migrations 0190-0219 layout
 */

import { z } from "zod";

/* ========================================================================== */
/* Constants & Identifiers                                                    */
/* ========================================================================== */

export const CONNECT_DESKTOP_PIPE_NAME = "\\\\.\\pipe\\connect-desktop" as const;
export const CONNECT_DESKTOP_PIPE_SHORT_NAME = "connect-desktop" as const;
export const DESKTOP_AUTH_HEADER = "x-desktop-token" as const;
export const DESKTOP_DEFAULT_PORT = 3101 as const;

export const DESKTOP_MCP_TOOLS = {
  OPEN_APP: "desktop.open_app",
  OPEN_URL: "desktop.open_url",
  FIND_ELEMENT: "desktop.find_element",
  CLICK: "desktop.click",
  TYPE_TEXT: "desktop.type_text",
  KEY_COMBO: "desktop.key_combo",
  SCROLL: "desktop.scroll",
  READ_SCREEN_TEXT: "desktop.read_screen_text",
  SCREENSHOT: "desktop.screenshot",
  SHOW_CARD: "desktop.show_card",
  GET_ACTIVE_WINDOW: "desktop.get_active_window",
} as const;

export type DesktopMcpToolName = (typeof DESKTOP_MCP_TOOLS)[keyof typeof DESKTOP_MCP_TOOLS];

/* ========================================================================== */
/* Risk Levels & Safety                                                       */
/* ========================================================================== */

export const DesktopRiskLevelSchema = z.enum(["read", "act", "destructive"]);
export type DesktopRiskLevel = z.infer<typeof DesktopRiskLevelSchema>;

export const RiskClassifications: Record<DesktopActionType, DesktopRiskLevel> = {
  open_app: "act",
  open_url: "act",
  find_element: "read",
  click: "act",
  type_text: "act",
  key_combo: "act",
  scroll: "act",
  read_screen_text: "read",
  screenshot: "read",
};

/* ========================================================================== */
/* UI Automation & Coordinates                                                */
/* ========================================================================== */

export const DesktopRegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  dpiScale: z.number().default(1.0),
});
export type DesktopRegion = z.infer<typeof DesktopRegionSchema>;

export const DesktopTargetCoordinatesSchema = z.object({
  x: z.number(),
  y: z.number(),
  dpiScale: z.number().optional().default(1.0),
});
export type DesktopTargetCoordinates = z.infer<typeof DesktopTargetCoordinatesSchema>;

export const DesktopElementSelectorSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(), // Button, Edit, Text, MenuItem, etc.
  automationId: z.string().optional(),
  className: z.string().optional(),
  fuzzyText: z.string().optional(),
  index: z.number().int().optional().default(0),
});
export type DesktopElementSelector = z.infer<typeof DesktopElementSelectorSchema>;

export const DesktopWindowInfoSchema = z.object({
  hwnd: z.number().int(),
  title: z.string(),
  processName: z.string(),
  processId: z.number().int(),
  isElevated: z.boolean().default(false),
  bounds: DesktopRegionSchema.optional(),
});
export type DesktopWindowInfo = z.infer<typeof DesktopWindowInfoSchema>;

/* ========================================================================== */
/* Desktop Actions                                                            */
/* ========================================================================== */

export const DesktopActionTypeSchema = z.enum([
  "open_app",
  "open_url",
  "find_element",
  "click",
  "type_text",
  "key_combo",
  "scroll",
  "read_screen_text",
  "screenshot",
]);
export type DesktopActionType = z.infer<typeof DesktopActionTypeSchema>;

// Individual Action Payloads
export const OpenAppPayloadSchema = z.object({
  appName: z.string().min(1),
  executablePath: z.string().optional(),
  arguments: z.string().optional(),
  workingDirectory: z.string().optional(),
});
export type OpenAppPayload = z.infer<typeof OpenAppPayloadSchema>;

export const OpenUrlPayloadSchema = z.object({
  url: z.string().url(),
  preferHelium: z.boolean().default(true),
  newWindow: z.boolean().default(false),
});
export type OpenUrlPayload = z.infer<typeof OpenUrlPayloadSchema>;

export const FindElementPayloadSchema = z.object({
  selector: DesktopElementSelectorSchema,
  scopeWindowHwnd: z.number().int().optional(),
  timeoutMs: z.number().int().optional().default(3000),
});
export type FindElementPayload = z.infer<typeof FindElementPayloadSchema>;

export const ClickPayloadSchema = z.object({
  coordinates: DesktopTargetCoordinatesSchema.optional(),
  selector: DesktopElementSelectorSchema.optional(),
  elementId: z.string().optional(),
  button: z.enum(["left", "right", "middle"]).default("left"),
  clickType: z.enum(["single", "double", "triple"]).default("single"),
  modifiers: z.array(z.string()).optional(),
});
export type ClickPayload = z.infer<typeof ClickPayloadSchema>;

export const TypeTextPayloadSchema = z.object({
  text: z.string(),
  selector: DesktopElementSelectorSchema.optional(),
  clearFirst: z.boolean().default(false),
  useClipboardFallback: z.boolean().default(true),
  delayMs: z.number().int().optional().default(10),
});
export type TypeTextPayload = z.infer<typeof TypeTextPayloadSchema>;

export const KeyComboPayloadSchema = z.object({
  keys: z.array(z.string()).min(1), // e.g. ["Control", "Shift", "Escape"] or ["Control", "V"]
  holdDurationMs: z.number().int().optional().default(50),
});
export type KeyComboPayload = z.infer<typeof KeyComboPayloadSchema>;

export const ScrollPayloadSchema = z.object({
  direction: z.enum(["up", "down", "left", "right"]).default("down"),
  amount: z.number().int().default(3), // lines or notches
  coordinates: DesktopTargetCoordinatesSchema.optional(),
});
export type ScrollPayload = z.infer<typeof ScrollPayloadSchema>;

export const ReadScreenTextPayloadSchema = z.object({
  region: DesktopRegionSchema.optional(),
  useOcr: z.boolean().default(false),
  includeUiaTree: z.boolean().default(true),
});
export type ReadScreenTextPayload = z.infer<typeof ReadScreenTextPayloadSchema>;

export const ScreenshotPayloadSchema = z.object({
  region: DesktopRegionSchema.optional(),
  windowHwnd: z.number().int().optional(),
  savePath: z.string().optional(),
  returnBase64: z.boolean().default(false),
});
export type ScreenshotPayload = z.infer<typeof ScreenshotPayloadSchema>;

// Unified Desktop Action Schema
export const DesktopActionSchema = z.object({
  id: z.string().optional(),
  type: DesktopActionTypeSchema,
  risk: DesktopRiskLevelSchema.optional(),
  targetDescription: z.string().optional(),
  openApp: OpenAppPayloadSchema.optional(),
  openUrl: OpenUrlPayloadSchema.optional(),
  findElement: FindElementPayloadSchema.optional(),
  click: ClickPayloadSchema.optional(),
  typeText: TypeTextPayloadSchema.optional(),
  keyCombo: KeyComboPayloadSchema.optional(),
  scroll: ScrollPayloadSchema.optional(),
  readScreenText: ReadScreenTextPayloadSchema.optional(),
  screenshot: ScreenshotPayloadSchema.optional(),
});
export type DesktopAction = z.infer<typeof DesktopActionSchema>;

/* ========================================================================== */
/* JSON-RPC 2.0 Base Protocol for Named Pipe (\\.\pipe\connect-desktop)       */
/* ========================================================================== */

export const JsonRpcVersionSchema = z.literal("2.0");

export const JsonRpcRequestSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

export const JsonRpcErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z.unknown().optional(),
});
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export const JsonRpcResponseSchema = z.object({
  jsonrpc: JsonRpcVersionSchema,
  id: z.union([z.string(), z.number()]).nullable(),
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
});
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

/* ========================================================================== */
/* Named Pipe JSON-RPC Methods & Payloads                                     */
/* ========================================================================== */

export const DesktopPipeMethods = {
  HOTKEY_EVENT: "hotkey.event",
  DICTATION_START: "dictation.start",
  DICTATION_STOP: "dictation.stop",
  DICTATION_RESULT: "dictation.result",
  CIRCLE_REQUEST: "circle.request",
  CIRCLE_RESULT: "circle.result",
  ACTION_EXECUTE: "action.execute",
  ACTION_RESULT: "action.result",
  SAFETY_CONFIRM_REQUEST: "safety.confirm.request",
  SAFETY_CONFIRM_RESPONSE: "safety.confirm.response",
  KILLSWITCH_FIRE: "killswitch.fire",
  NOTCH_CARD_SHOW: "notch.card.show",
  TOAST_SHOW: "toast.show",
} as const;
export type DesktopPipeMethod = (typeof DesktopPipeMethods)[keyof typeof DesktopPipeMethods];

// 1. Hotkey Event
export const HotkeyEventParamsSchema = z.object({
  hotkeyId: z.enum(["dictate_hold", "circle_hold", "chat_open", "killswitch"]),
  state: z.enum(["pressed", "released"]),
  modifiers: z.array(z.enum(["ctrl", "win", "shift", "alt"])),
  vkCode: z.number().int(),
  timestamp: z.string().datetime(),
});
export type HotkeyEventParams = z.infer<typeof HotkeyEventParamsSchema>;

// 2. Dictation Start / Stop / Result
export const DictationStartParamsSchema = z.object({
  sessionId: z.string(),
  targetWindow: DesktopWindowInfoSchema.optional(),
  source: z.enum(["hotkey", "ui"]).default("hotkey"),
  language: z.string().optional().default("de"),
});
export type DictationStartParams = z.infer<typeof DictationStartParamsSchema>;

export const DictationStopParamsSchema = z.object({
  sessionId: z.string(),
  cancel: z.boolean().default(false),
});
export type DictationStopParams = z.infer<typeof DictationStopParamsSchema>;

export const DictationResultParamsSchema = z.object({
  sessionId: z.string(),
  rawTranscript: stringOrEmpty(),
  cleanedText: z.string(),
  durationMs: z.number(),
  inserted: z.boolean(),
  insertionMethod: z.enum(["uia_value", "clipboard_paste", "none"]).default("none"),
  error: z.string().optional(),
});
export type DictationResultParams = z.infer<typeof DictationResultParamsSchema>;

// 3. Circle to ask Request / Result
export const CircleRequestParamsSchema = z.object({
  sessionId: z.string(),
  region: DesktopRegionSchema,
  audioPromptPath: z.string().optional(),
  textPrompt: z.string().optional(),
  activeWindow: DesktopWindowInfoSchema.optional(),
});
export type CircleRequestParams = z.infer<typeof CircleRequestParamsSchema>;

export const CircleResultParamsSchema = z.object({
  sessionId: z.string(),
  screenshotPath: z.string(),
  intent: z.string(),
  interpretation: z.string().optional(),
  actionsPlanned: z.array(DesktopActionSchema),
  executed: z.boolean(),
  status: z.enum(["success", "canceled", "error"]),
  error: z.string().optional(),
});
export type CircleResultParams = z.infer<typeof CircleResultParamsSchema>;

// 4. Action Execute / Result
export const ActionExecuteParamsSchema = z.object({
  actionId: z.string(),
  sessionId: z.string().optional(),
  action: DesktopActionSchema,
  confirmationToken: z.string().optional(),
  sourceAgentId: z.string().optional(),
});
export type ActionExecuteParams = z.infer<typeof ActionExecuteParamsSchema>;

export const ActionResultParamsSchema = z.object({
  actionId: z.string(),
  status: z.enum(["success", "failed", "rejected", "killswitch_aborted"]),
  resultData: z.unknown().optional(),
  error: z.string().optional(),
  executionDurationMs: z.number(),
  targetDescription: z.string().optional(),
});
export type ActionResultParams = z.infer<typeof ActionResultParamsSchema>;

// 5. Safety Confirm Request / Response
export const SafetyConfirmRequestParamsSchema = z.object({
  confirmationId: z.string(),
  actionId: z.string(),
  agentId: z.string().optional(),
  riskLevel: DesktopRiskLevelSchema,
  reason: z.string(),
  actionSummary: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
  timeoutMs: z.number().int().default(15000),
});
export type SafetyConfirmRequestParams = z.infer<typeof SafetyConfirmRequestParamsSchema>;

export const SafetyConfirmResponseParamsSchema = z.object({
  confirmationId: z.string(),
  actionId: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
  decidedAt: z.string().datetime(),
});
export type SafetyConfirmResponseParams = z.infer<typeof SafetyConfirmResponseParamsSchema>;

// 6. Killswitch Fire
export const KillswitchFireParamsSchema = z.object({
  source: z.enum(["hotkey", "notch_ui", "api"]),
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type KillswitchFireParams = z.infer<typeof KillswitchFireParamsSchema>;

// 7. Notch Card Show
export const NotchCardButtonSchema = z.object({
  id: z.string(),
  label: z.string(),
  variant: z.enum(["primary", "secondary", "danger"]).default("secondary"),
});
export type NotchCardButton = z.infer<typeof NotchCardButtonSchema>;

export const NotchCardShowParamsSchema = z.object({
  cardId: z.string(),
  type: z.enum([
    "action",
    "dictation",
    "circle",
    "routine",
    "safety_confirm",
    "media",
    "status",
  ]),
  title: z.string(),
  message: z.string(),
  accentColor: z.string().optional(),
  icon: z.string().optional(),
  buttons: z.array(NotchCardButtonSchema).optional(),
  timeoutMs: z.number().int().optional().default(6000),
});
export type NotchCardShowParams = z.infer<typeof NotchCardShowParamsSchema>;

// 8. Toast Show
export const ToastShowParamsSchema = z.object({
  title: z.string(),
  message: z.string(),
  icon: z.string().optional(),
  actionUrl: z.string().optional(),
  durationMs: z.number().int().optional().default(4000),
});
export type ToastShowParams = z.infer<typeof ToastShowParamsSchema>;

/* ========================================================================== */
/* Server API (/api/desktop/*) Models & Payloads                              */
/* ========================================================================== */

// POST /api/desktop/dictation/clean
export const DictationCleanRequestSchema = z.object({
  rawTranscript: z.string(),
  language: z.string().optional().default("de"),
  context: z.string().optional(),
});
export type DictationCleanRequest = z.infer<typeof DictationCleanRequestSchema>;

export const DictationCleanResponseSchema = z.object({
  cleanedText: z.string(),
  model: z.string(),
  durationMs: z.number(),
});
export type DictationCleanResponse = z.infer<typeof DictationCleanResponseSchema>;

// POST /api/desktop/circle
export const CircleAnalyzeRequestSchema = z.object({
  imageBase64: z.string().optional(),
  imagePath: z.string().optional(),
  textPrompt: z.string().optional(),
  uiaElements: z.array(z.record(z.string(), z.unknown())).optional(),
  windowTitle: z.string().optional(),
});
export type CircleAnalyzeRequest = z.infer<typeof CircleAnalyzeRequestSchema>;

export const CircleAnalyzeResponseSchema = z.object({
  intent: z.string(),
  interpretation: z.string(),
  plan: z.array(DesktopActionSchema),
  confidence: z.number().min(0).max(1),
});
export type CircleAnalyzeResponse = z.infer<typeof CircleAnalyzeResponseSchema>;

// POST /api/desktop/intent
export const IntentClassifyRequestSchema = z.object({
  text: z.string().min(1),
  context: z
    .object({
      activeWindow: z.string().optional(),
      recentActions: z.array(z.string()).optional(),
    })
    .optional(),
});
export type IntentClassifyRequest = z.infer<typeof IntentClassifyRequestSchema>;

export const IntentClassifyResponseSchema = z.object({
  intentType: z.enum(["local_action", "agent_task", "schedule", "answer"]),
  confidence: z.number().min(0).max(1),
  suggestedAction: DesktopActionSchema.optional(),
  agentTask: z
    .object({
      agentId: z.string().optional(),
      prompt: z.string(),
    })
    .optional(),
  schedule: z.record(z.string(), z.unknown()).optional(),
  explanation: z.string().optional(),
});
export type IntentClassifyResponse = z.infer<typeof IntentClassifyResponseSchema>;

// POST /api/desktop/actions/execute
export const ActionExecuteApiRequestSchema = z.object({
  action: DesktopActionSchema,
  agentId: z.string().optional(),
  confirmationToken: z.string().optional(),
});
export type ActionExecuteApiRequest = z.infer<typeof ActionExecuteApiRequestSchema>;

export const ActionExecuteApiResponseSchema = z.object({
  success: z.boolean(),
  actionId: z.string(),
  resultData: z.unknown().optional(),
  requiresConfirmation: z.boolean().default(false),
  confirmationId: z.string().optional(),
  error: z.string().optional(),
});
export type ActionExecuteApiResponse = z.infer<typeof ActionExecuteApiResponseSchema>;

// Routines Models
export const DesktopRoutineSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  cronExpression: z.string(),
  enabled: z.boolean().default(true),
  actions: z.array(DesktopActionSchema),
  targetAgentId: z.string().optional(),
  lastRunAt: z.string().datetime().optional(),
  nextRunAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DesktopRoutine = z.infer<typeof DesktopRoutineSchema>;

export const CreateDesktopRoutineSchema = DesktopRoutineSchema.omit({
  id: true,
  lastRunAt: true,
  nextRunAt: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateDesktopRoutineInput = z.infer<typeof CreateDesktopRoutineSchema>;

export const UpdateDesktopRoutineSchema = CreateDesktopRoutineSchema.partial();
export type UpdateDesktopRoutineInput = z.infer<typeof UpdateDesktopRoutineSchema>;

// Todos Models
export const DesktopTodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  dueTime: z.string().datetime().optional(),
  completed: z.boolean().default(false),
  completedAt: z.string().datetime().optional(),
  associatedUrl: z.string().url().optional(),
  associatedApp: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DesktopTodo = z.infer<typeof DesktopTodoSchema>;

export const CreateDesktopTodoSchema = DesktopTodoSchema.omit({
  id: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateDesktopTodoInput = z.infer<typeof CreateDesktopTodoSchema>;

export const UpdateDesktopTodoSchema = CreateDesktopTodoSchema.partial();
export type UpdateDesktopTodoInput = z.infer<typeof UpdateDesktopTodoSchema>;

// Permissions Models
export const AgentDesktopPermissionSchema = z.object({
  agentId: z.string(),
  permissionLevel: z.enum(["none", "read", "act", "destructive_with_confirm"]),
  allowedApps: z.array(z.string()).default([]),
  allowedDomains: z.array(z.string()).default([]),
  rateLimitPerMinute: z.number().int().default(30),
  updatedAt: z.string().datetime(),
});
export type AgentDesktopPermission = z.infer<typeof AgentDesktopPermissionSchema>;

export const UpdateAgentDesktopPermissionSchema = AgentDesktopPermissionSchema.omit({
  updatedAt: true,
});
export type UpdateAgentDesktopPermissionInput = z.infer<
  typeof UpdateAgentDesktopPermissionSchema
>;

// Action Log Models
export const DesktopActionLogEntrySchema = z.object({
  id: z.string(),
  actionId: z.string(),
  agentId: z.string().optional(),
  actionType: DesktopActionTypeSchema,
  riskLevel: DesktopRiskLevelSchema,
  targetDescription: z.string(),
  status: z.enum(["success", "failed", "rejected", "killswitch_aborted"]),
  screenshotHash: z.string().optional(),
  durationMs: z.number().int(),
  errorMessage: z.string().optional(),
  executedAt: z.string().datetime(),
});
export type DesktopActionLogEntry = z.infer<typeof DesktopActionLogEntrySchema>;

export const CreateDesktopActionLogEntrySchema = DesktopActionLogEntrySchema.omit({
  id: true,
  executedAt: true,
});
export type CreateDesktopActionLogEntryInput = z.infer<
  typeof CreateDesktopActionLogEntrySchema
>;

/* ========================================================================== */
/* Helpers                                                                    */
/* ========================================================================== */

function stringOrEmpty() {
  return z.string().default("");
}
