import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
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
import { addAgentToCompany } from "@/lib/companies/store";
import { isComposing } from "@/lib/composing";
import { cn } from "@/lib/utils";
import { queryClient } from "@/query-client";

const ACTIVE_COMPANY_KEY = "connect.activeCompanyId";

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
}: {
  open: boolean;
  onClose: () => void;
  /** The new coworker's id, so the caller can open its dialog on it. */
  onCreated: (agentId: string) => void;
}) {
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent>
        {/* All wizard state lives below DialogContent, whose portal unmounts on close: dismissing
            the dialog mid-way discards the half-answered steps rather than pickling them. */}
        <CreateAgentWizard onClose={onClose} onCreated={onCreated} />
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
}: {
  onClose: () => void;
  onCreated: (agentId: string) => void;
}) {
  const createAgent = useMutation(createAgentMutationOptions(queryClient));
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  /** Whether this step's Continue was pressed, which is when its errors become worth showing. */
  const [tried, setTried] = useState(false);
  const [values, setValues] = useState<AgentFormValues>(emptyAgentForm);
  const [family, setFamily] = useState<AgentModelFamily>("manus");
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
    // New bots created while a company is active belong on that roster.
    try {
      const companyId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(ACTIVE_COMPANY_KEY)
          : null;
      if (companyId) addAgentToCompany(companyId, agent.id);
    } catch {
      /* company missing or read-only seed — bot still exists under Marketplace */
    }
    onCreated(agent.id);
  };

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
    </>
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

