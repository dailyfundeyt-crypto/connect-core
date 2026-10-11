import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState, useEffect } from "react";
import useMeasure from "react-use-measure";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Questionnaire,
  QuestionnaireDescription,
  QuestionnaireItem,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { Textarea } from "@/components/ui/textarea";
import {
  type AgentFormValues,
  agentFormSchema,
  agentInputFrom,
  emptyAgentForm,
} from "@/lib/agents/form";
import {
  BETA_MODEL_FAMILIES,
  MODEL_FAMILIES,
  PRIMARY_MODEL_FAMILIES,
  provisionAgentModels,
  type AgentModelFamily,
} from "@/lib/agents/agent-models";
import { isShellFamily, provisionAgentShell } from "@/lib/agents/agent-shell";
import { createAgentMutationOptions } from "@/lib/agents/mutations";
import { ensureZgptProfileForAgent } from "@/lib/agents/zgpt-profiles";
import {
  addAgentToCompany,
  listCompanies,
  subscribeCompanies,
} from "@/lib/companies/store";
import { isComposing } from "@/lib/composing";
import { cn } from "@/lib/utils";
import { queryClient } from "@/query-client";

/**
 * The `?new=1` open on `/agents?tab=mine` reaches this dialog. The dialog has two paths into
 * roster assignment: `activeCompanyId` is the company the user came from (preferred — set by the
 * route), `ACTIVE_COMPANY_KEY` is the persisted pointer and only used as a final fallback so the
 * dialog keeps working in callers that haven't been updated to pass `activeCompanyId` yet.

/**
 * Creating a coworker, one question at a time.
 *
 * A wizard rather than a form, because the answers are who this coworker is.
 * Connect bots always run locally and are always private — no remote AG-UI
 * endpoint and no public/private choice.
 */
export function CreateAgentDialog({
  open,
  onClose,
  onCreated,
  activeCompanyId,
}: {
  open: boolean;
  onClose: () => void;
  /** The new coworker's id, so the caller can open its dialog on it. */
  onCreated: (agentId: string) => void;
  /**
   * Company the user came from when they opened this dialog. When set, new bots are added to
   * that company's roster automatically — that is the path from inside a company workspace.
   * When null (e.g. Marketplace), the user is asked which company to assign to.
   */
  activeCompanyId: string | null;
}) {
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent>
        {/* All wizard state lives below DialogContent, whose portal unmounts on close: dismissing
            the dialog mid-way discards the half-answered steps rather than pickling them. */}
        <CreateAgentWizard
          activeCompanyId={activeCompanyId}
          onClose={onClose}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The steps, in the order they are asked. Every bot is private — no public option. */
const STEPS = ["identity", "family"] as const;
type StepName = (typeof STEPS)[number];

/** The first step's slice of the form contract, so its errors match the server's limits. */
const identitySchema = agentFormSchema.pick({
  name: true,
  title: true,
  roleDescription: true,
});

type IdentityField = keyof typeof identitySchema.shape;

/** First message per field, or nothing when the step parses. */
function identityIssues(
  values: AgentFormValues,
): Partial<Record<IdentityField, string>> {
  const parsed = identitySchema.safeParse(values);
  if (parsed.success) return {};
  const issues: Partial<Record<IdentityField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as IdentityField | undefined;
    if (field && !issues[field]) issues[field] = issue.message;
  }
  return issues;
}

/** A pane arrives from the side the journey is moving toward, and leaves out the other. */
const variants = {
  initial: (direction: number) => ({ x: `${110 * direction}%`, opacity: 0 }),
  active: { x: "0%", opacity: 1 },
  exit: (direction: number) => ({ x: `${-110 * direction}%`, opacity: 0 }),
};

function CreateAgentWizard({
  onClose,
  onCreated,
  activeCompanyId,
}: {
  onClose: () => void;
  onCreated: (agentId: string) => void;
  activeCompanyId: string | null;
}) {
  const createAgent = useMutation(createAgentMutationOptions(queryClient));
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  /** Whether this step's Continue was pressed, which is when its errors become worth showing. */
  const [tried, setTried] = useState(false);
  const [values, setValues] = useState<AgentFormValues>(emptyAgentForm);
  const [family, setFamily] = useState<AgentModelFamily>("manus");
  /**
   * Set when the bot exists but could not be put on a company roster. The wizard is already gone
   * by then, so this rides out to the caller as a dialog instead — the one moment the user could
   * act on it is the moment they learn the bot landed in the Marketplace instead of their company.
   */
  const [assignmentWarning, setAssignmentWarning] = useState<{
    agentId: string;
    companyId: string | null;
  } | null>(null);
  /**
   * Picker shown when the wizard was opened without an active company. Holds open until the user
   * picks a company or cancels. The promise-resolver pattern lets `advance()` await the choice
   * without losing the wizard state — closing the wizard during the picker would leave us with a
   * created bot and no place to assign it to.
   */
  const [companyPicker, setCompanyPicker] = useState<{
    open: boolean;
    agentId: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [ref, bounds] = useMeasure();

  const last = step === STEPS.length - 1;
  const set = <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const identityErrors = tried ? identityIssues(values) : {};
  const stepValid = (): boolean => {
    if (STEPS[step] === "identity") {
      return identitySchema.safeParse(values).success;
    }
    if (STEPS[step] === "family") {
      return MODEL_FAMILIES.some((f) => f.id === family);
    }
    return true;
  };

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setTried(false);
    setStep(to);
  };

  /**
   * Every way forward lands here — the Continue button, Enter in a field, Enter on a choice — as
   * the questionnaire form's submit. Backwards never validates; half answers are fine to leave.
   */
  const advance = async () => {
    if (!stepValid()) {
      setTried(true);
      return;
    }
    if (!last) {
      go(step + 1);
      return;
    }
    const agent = await createAgent.mutateAsync(
      agentInputFrom({
        ...values,
        visibility: "private",
        endpoint: "",
        authValue: "",
      }),
    );
    provisionAgentModels(agent.id, family);
    if (isShellFamily(family)) {
      provisionAgentShell(
        agent.id,
        family,
        family === "manus" ? "cloud" : "local",
      );
      if (family === "chatgpt") {
        ensureZgptProfileForAgent(agent.id, values.name.trim() || agent.name);
      }
    }
    /*
     * Roster assignment.
     *
     * `activeCompanyId` comes from the route the user came from:
     *  - From inside `/company/$companyId` (e.g. Spark)  → set, automatic assignment, no prompt.
     *  - From the Marketplace (no active workspace)     → null, prompt for a company before
     *                                                    opening the new channel.
     *
     * `resolveCompanyId` is the only path that normalizes the quoting AND verifies the id exists.
     * The fallbacks here are deliberate and minimal: any other read is a bug, and silently
     * dropping the assignment on a miss is the bug we are leaving behind.
     */
    if (!activeCompanyId) {
      // No active company — ask the user to pick one before we open the new channel. The roster
      // assignment happens here so the bot ends up on the right company the first time it
      // appears, not the next time the user re-opens Marketplace.
      const picked = await onAssignmentNeeded(agent.id);
      if (!picked) {
        // The user dismissed the picker; do not silently leave the bot orphaned.
        onAssignmentFailed(agent.id, null);
        return;
      }
      try {
        await addAgentToCompany(picked, agent.id);
      } catch (err) {
        console.error("[create-agent] roster assignment failed:", err, {
          agentId: agent.id,
          companyId: picked,
        });
        onAssignmentFailed(agent.id, picked);
        return;
      }
    } else {
      try {
        await addAgentToCompany(activeCompanyId, agent.id);
      } catch (err) {
        console.error("[create-agent] roster assignment failed:", err, {
          agentId: agent.id,
          companyId: activeCompanyId,
        });
        onAssignmentFailed(agent.id, activeCompanyId);
        return;
      }
    }
    onCreated(agent.id);
  };

  const onAssignmentFailed = (agentId: string, companyId: string | null) => {
    setAssignmentWarning({ agentId, companyId });
  };

  /**
   * Show the company picker and resolve with the picked company id, or null if dismissed.
   *
   * The picker is a separate dialog stacked above the wizard. Because the wizard's DialogContent
   * is already inside a portal, this picker mounts above it on the second portal and stays put
   * until the user picks or cancels.
   */
  const onAssignmentNeeded = (agentId: string): Promise<string | null> =>
    new Promise((resolve) => {
      setCompanyPicker({ open: true, agentId, resolve });
    });

  return (
    <>
      {/* Read aloud, never shown: each step carries its own heading, and a dialog-level title
          above them made two heading sizes compete. The popup still needs an accessible name. */}
      <DialogTitle className="sr-only">New coworker</DialogTitle>
      <DialogBody className="overflow-y-auto">
        <Questionnaire
          item={STEPS[step]}
          noValidate
          /*
           * Enter means Continue, handled here rather than through the form's submit. The
           * questionnaire's own submit path refuses any item it does not consider answered, and it
           * cannot see these fields: the identity inputs are this dialog's own, not registered
           * answers. Running first and preventing default also keeps the primitive's Enter
           * handling out of the way; a textarea keeps Enter for its line breaks. The Enter that
           * confirms a composed character is left alone, as the primitive leaves it: it finishes a
           * character, not the step.
           */
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !isComposing(event) &&
              event.target instanceof HTMLInputElement
            ) {
              event.preventDefault();
              void advance();
            }
          }}
          onSubmit={(event) => event.preventDefault()}
        >
          {/* A plain element rather than QuestionnaireProgress: only the active step is mounted,
              so the primitive would count one question and announce the wrong total. */}
          <p className="text-xs font-medium text-muted-foreground tabular-nums">
            Step {step + 1} of {STEPS.length}
          </p>
          <MotionConfig
            transition={{ duration: 0.5, type: "spring", bounce: 0 }}
          >
            {/* The frame follows each pane's height, so the buttons glide instead of jumping.
                `relative` is load-bearing: popLayout positions the exiting pane absolutely, and an
                absolute element is clipped by overflow-hidden only on an ancestor that positions
                it. Without this its containing block is the dialog popup, and the old pane slides
                across the whole dialog instead of out of this frame. */}
            <motion.div
              animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}
              className="relative overflow-hidden"
            >
              <div ref={ref}>
                <AnimatePresence
                  custom={direction}
                  initial={false}
                  mode="popLayout"
                >
                  <motion.div
                    animate="active"
                    className="pt-4"
                    custom={direction}
                    exit="exit"
                    initial="initial"
                    key={STEPS[step]}
                    variants={variants}
                  >
                    {STEPS[step] === "identity" ? (
                      <IdentityStep
                        errors={identityErrors}
                        set={set}
                        values={values}
                      />
                    ) : (
                      <FamilyStep family={family} onPick={setFamily} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </MotionConfig>

          {createAgent.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {createAgent.error.message}
            </p>
          ) : null}

          <div className="mt-6 flex justify-between gap-2">
            <Button
              onClick={step === 0 ? onClose : () => go(step - 1)}
              type="button"
              variant="outline"
            >
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            <Button
              disabled={createAgent.isPending}
              onClick={() => void advance()}
              type="button"
            >
              {last
                ? createAgent.isPending
                  ? "Creating…"
                  : "Create coworker"
                : "Continue"}
            </Button>
          </div>
        </Questionnaire>
      </DialogBody>

      {/*
       * The bot exists; putting it on a company roster did not. Said plainly, because the symptom
       * the user would otherwise see is an empty sidebar and a bot that is "just gone" from where
       * they made it — and the only real fix is the move action in the company agents list.
       */}
      <Dialog
        onOpenChange={(next) => {
          if (!next) setAssignmentWarning(null);
        }}
        open={assignmentWarning !== null}
      >
        <DialogContent>
          <DialogTitle>Bot angelegt, aber nicht zugeordnet</DialogTitle>
          <DialogBody className="space-y-3 text-sm text-muted-foreground">
            <p>
              Der Bot wurde erstellt und ist im Marketplace unter
              <span className="font-medium text-foreground"> Meine Bots </span>
              gespeichert. Er konnte keiner Firma zugeordnet werden
              {assignmentWarning?.companyId
                ? ` — die Firma „${assignmentWarning.companyId}" ist nicht erreichbar.`
                : " — es ist keine Firma ausgewählt."}
            </p>
            <p className="text-[13px]">
              Du kannst ihn unten über{" "}
              <span className="font-medium text-foreground">
                Unternehmen → Agents
              </span>{" "}
              jeder Firma zuweisen.
            </p>
          </DialogBody>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button onClick={() => setAssignmentWarning(null)} type="button">
              Verstanden
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/*
       * Picker — when the dialog was opened from the Marketplace (no active company), we ask
       * which company the bot should live on before we open the new channel. The chosen id is
       * returned to `advance()` via the promise stored in `companyPicker.resolve`.
       */}
      <Dialog
        onOpenChange={(next) => {
          if (!next && companyPicker?.open) {
            const resolver = companyPicker.resolve;
            setCompanyPicker(null);
            resolver(null);
          }
        }}
        open={companyPicker?.open === true}
      >
        <DialogContent>
          <DialogTitle>Welchem Unternehmen zuordnen?</DialogTitle>
          <DialogBody className="space-y-3 text-sm text-muted-foreground">
            <p>
              Du bist gerade in keinem Unternehmen. Damit der Bot in der
              Sidebar dieser Firma auftaucht, wähle eines aus.
            </p>
            <CompanyList
              onPick={(companyId) => {
                if (!companyPicker) return;
                const resolver = companyPicker.resolve;
                setCompanyPicker(null);
                resolver(companyId);
              }}
            />
          </DialogBody>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button
              onClick={() => {
                if (!companyPicker) return;
                const resolver = companyPicker.resolve;
                setCompanyPicker(null);
                resolver(null);
              }}
              type="button"
              variant="outline"
            >
              Abbrechen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Inline list of available companies. Kept small — a picker that does the work of finding a
 * specific company is a job for the company switcher, not this dialog.
 */
function CompanyList({ onPick }: { onPick: (companyId: string) => void }) {
  const [companies, setCompanies] = useState(() => listCompanies());
  useEffect(() => subscribeCompanies(() => setCompanies(listCompanies())), []);
  if (companies.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Unternehmen angelegt. Lege zuerst eines an, dann kannst du
        Bots zuordnen.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {companies.map((company) => (
        <li key={company.id}>
          <button
            className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted"
            onClick={() => onPick(company.id)}
            type="button"
          >
            <span className="truncate text-sm font-medium text-foreground">
              {company.name}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {company.id}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * `hidden={false}` and `inert={false}` on every item, against the questionnaire's own hiding.
 *
 * The primitive blanks any item that is not the active one, which is right for its stacked layout
 * and wrong here: only the active step is mounted, except for the instant an old pane is sliding
 * out under AnimatePresence — exactly when the primitive would blank it mid-slide. The item's
 * visibility is the animation's job in this dialog, never the questionnaire's.
 */
function StepItem({
  name,
  children,
}: {
  name: StepName;
  children: React.ReactNode;
}) {
  return (
    <QuestionnaireItem hidden={false} inert={false} name={name}>
      {children}
    </QuestionnaireItem>
  );
}

function IdentityStep({
  values,
  errors,
  set,
}: {
  values: AgentFormValues;
  errors: Partial<Record<IdentityField, string>>;
  set: <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => void;
}) {
  return (
    <StepItem name="identity">
      <QuestionnaireTitle>Who is this coworker?</QuestionnaireTitle>
      <QuestionnaireDescription>
        The role you write here applies in every channel this coworker works in.
      </QuestionnaireDescription>
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="create-agent-name">Name</FieldLabel>
          <Input
            aria-invalid={errors.name ? true : undefined}
            id="create-agent-name"
            onChange={(event) => set("name", event.target.value)}
            placeholder="Expense Manager"
            value={values.name}
          />
          {errors.name ? (
            <FieldError errors={[{ message: errors.name }]} />
          ) : null}
        </Field>
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor="create-agent-title">Title</FieldLabel>
          <Input
            aria-invalid={errors.title ? true : undefined}
            id="create-agent-title"
            onChange={(event) => set("title", event.target.value)}
            placeholder="Finance Operations"
            value={values.title}
          />
          {errors.title ? (
            <FieldError errors={[{ message: errors.title }]} />
          ) : null}
        </Field>
        <Field data-invalid={errors.roleDescription ? true : undefined}>
          <FieldLabel htmlFor="create-agent-role">Role</FieldLabel>
          <Textarea
            aria-invalid={errors.roleDescription ? true : undefined}
            id="create-agent-role"
            onChange={(event) => set("roleDescription", event.target.value)}
            placeholder="Review receipts, categorize expenses, and prepare reimbursement reports."
            rows={4}
            value={values.roleDescription}
          />
          {errors.roleDescription ? (
            <FieldError errors={[{ message: errors.roleDescription }]} />
          ) : null}
        </Field>
      </FieldGroup>
    </StepItem>
  );
}

function FamilyStep({
  family,
  onPick,
}: {
  family: AgentModelFamily;
  onPick: (next: AgentModelFamily) => void;
}) {
  return (
    <StepItem name="family">
      <QuestionnaireTitle>Model Provider?</QuestionnaireTitle>
      <QuestionnaireDescription>
        Model One = External (Manus per API-Key oder ZGPT per unsichtbarem
        Terminal). Model Two = Hermes (lokal). Global unter Settings → Model
        Provider. Chat bleibt nur Composer + Upload.
      </QuestionnaireDescription>
      <div className="mt-2 flex flex-col gap-2">
        {PRIMARY_MODEL_FAMILIES.map((f) => {
          const selected = f.id === family;
          return (
            <button
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-foreground bg-accent"
                  : "border-border hover:bg-muted/60",
              )}
              key={f.id}
              onClick={() => onPick(f.id)}
              type="button"
            >
              <p className="text-sm font-medium">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </button>
          );
        })}
      </div>
      <p className="mt-4 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Beta
      </p>
      <div className="mt-1.5 flex flex-col gap-2">
        {BETA_MODEL_FAMILIES.map((f) => {
          const selected = f.id === family;
          return (
            <button
              className={cn(
                "rounded-xl border border-dashed px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-foreground bg-accent"
                  : "border-border hover:bg-muted/60",
              )}
              key={f.id}
              onClick={() => onPick(f.id)}
              type="button"
            >
              <p className="text-sm font-medium">
                {f.label}
                <span className="ml-1.5 text-[10px] font-normal uppercase text-muted-foreground">
                  Beta
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </button>
          );
        })}
      </div>
    </StepItem>
  );
}

