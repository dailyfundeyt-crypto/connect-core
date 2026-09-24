import { useFrontendTool } from "@copilotkit/react-core/v2";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

/**
 * Visible mini-plan for multi-tool turns (Hermes Phase A).
 *
 * The Bot calls this once at the start of a longer turn; the card stays in the transcript so the
 * person can see what is left. Updating is another call with the same or revised steps.
 */

const stepSchema = z.object({
  id: z.string().describe("Stable id for this step, e.g. 1 or fetch-page"),
  text: z.string().describe("What this step does, in a few words"),
  status: z
    .enum(["pending", "doing", "done", "blocked"])
    .optional()
    .describe("Defaults to pending"),
});

type PlanStep = z.infer<typeof stepSchema>;

export function HermesPlanTools() {
  useFrontendTool({
    name: "hermes_plan",
    description:
      "Show a short plan for this turn before you start a multi-step tool sequence. " +
      "Call once with a goal and a few concrete steps; call again to update step status " +
      "as you finish each one. Keep it short — not a project plan.",
    parameters: z.object({
      goal: z.string().describe("What you are trying to finish this turn"),
      steps: z
        .array(stepSchema)
        .min(1)
        .max(12)
        .describe("Ordered steps for this turn"),
    }),
    handler: async (input: { goal: string; steps: PlanStep[] }) => ({
      ok: true,
      goal: input.goal,
      steps: input.steps,
    }),
    render: ({ args, status }) => (
      <HermesPlanCard
        goal={typeof args?.goal === "string" ? args.goal : ""}
        running={status !== "complete"}
        steps={Array.isArray(args?.steps) ? (args.steps as PlanStep[]) : []}
      />
    ),
  });

  return null;
}

function HermesPlanCard({
  goal,
  steps,
  running,
}: {
  goal: string;
  steps: PlanStep[];
  running: boolean;
}) {
  return (
    <div
      className={`my-2 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm ${
        running ? "tool-line-running" : ""
      }`}
      role="status"
    >
      <p className="font-medium text-foreground">
        {goal.trim() || "Working…"}
      </p>
      <ol className="mt-1.5 space-y-1 text-muted-foreground">
        {steps.map((step, index) => (
          <li className="flex gap-2" key={step.id || String(index)}>
            <span className="shrink-0 tabular-nums opacity-60">
              {statusMark(step.status)}
            </span>
            <span
              className={
                step.status === "done"
                  ? "line-through opacity-70"
                  : step.status === "blocked"
                    ? "text-destructive"
                    : step.status === "doing"
                      ? "text-foreground"
                      : undefined
              }
            >
              {step.text || "…"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function statusMark(status: PlanStep["status"]): string {
  switch (status) {
    case "done":
      return "✓";
    case "doing":
      return "→";
    case "blocked":
      return "!";
    default:
      return "○";
  }
}

/**
 * Ask card for a shell command — used when shell permission is Ask.
 * Allow / Deny / Allow always are the person's answers; the parent runs the command on Allow.
 */
export function ShellAskCard({
  command,
  onAllow,
  onDeny,
  onAllowAlways,
  busy,
}: {
  command: string;
  onAllow: () => void;
  onDeny: () => void;
  onAllowAlways?: () => void;
  busy?: boolean;
}) {
  const [sending, setSending] = useState<"allow" | "deny" | "always" | null>(
    null,
  );

  const go = (kind: "allow" | "deny" | "always", fn: () => void) => {
    if (busy || sending) return;
    setSending(kind);
    fn();
  };

  return (
    <div className="my-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
      <p className="font-medium text-foreground">Run this command?</p>
      <pre className="mt-1.5 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap break-all">
        {command}
      </pre>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          disabled={Boolean(busy || sending)}
          onClick={() => go("allow", onAllow)}
          size="sm"
          type="button"
        >
          {sending === "allow" ? "Running…" : "Allow"}
        </Button>
        <Button
          disabled={Boolean(busy || sending)}
          onClick={() => go("deny", onDeny)}
          size="sm"
          type="button"
          variant="outline"
        >
          Deny
        </Button>
        {onAllowAlways ? (
          <Button
            disabled={Boolean(busy || sending)}
            onClick={() => go("always", onAllowAlways)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Allow always
          </Button>
        ) : null}
      </div>
    </div>
  );
}
