import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState, useEffect, useRef } from "react";
import useMeasure from "react-use-measure";
import {
  IconUpload,
  IconRocket,
  IconBolt,
  IconDeviceDesktop,
  IconChartBar,
  IconBrain,
  IconCloud,
  IconLoader2,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconKey,
  IconRefresh,
  IconTerminal2,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { codexAccountsQueryOptions } from "@/lib/agents/queries";
import {
  cliManagerStatusQuery,
  type ManagedCliKind,
  startCliInstall,
  cliInstallJobQuery,
  startCliLoginFlow,
  cliLoginSessionQuery,
  saveHermesApiKey,
} from "@/lib/agent-hub/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  fileToAvatarDataUrl,
  setBotAvatarOverride,
} from "@/lib/agents/connect-avatars";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
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
import {
  type AgentFormValues,
  agentFormSchema,
  agentInputFrom,
  emptyAgentForm,
} from "@/lib/agents/form";
import {
  type AgentModelFamily,
  provisionAgentModels,
} from "@/lib/agents/agent-models";
import { isShellFamily, provisionAgentShell } from "@/lib/agents/agent-shell";
import { setAgentCliDefault, type CliTarget } from "@/lib/agents/agent-cli";
import {
  CloudAgentFields,
  type CloudAgentDraft,
  cloudDraftIssue,
  emptyCloudDraft,
} from "@/components/agents/cloud-agent-form";
import { saveCloudAgentConfig } from "@/lib/agents/cloud-agent";
import { createAgentMutationOptions } from "@/lib/agents/mutations";
import { ensureZgptProfileForAgent } from "@/lib/agents/zgpt-profiles";
import {
  addAgentToCompany,
  listCompanies,
  subscribeCompanies,
} from "@/lib/companies/store";
import { isComposing } from "@/lib/composing";
import { queryClient } from "@/query-client";
import { getT3Flag } from "@/lib/t3/contracts";
import { BotAvatar } from "@/components/bot-avatar/bot-avatar";
import {
  randomAgentAvatar,
  setAgentAvatar,
} from "@/lib/agents/agent-avatar";

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
  /*
   * Der neue „Neuen Bot erstellen"-Dialog (A30, Idee I7) tritt an die Stelle des
   * mehrstufigen Assistenten, sobald das Maskottchen-Flag gesetzt ist. Flag aus =
   * exakt der bisherige Wizard.
   *
   * A30 liefert die eigene Komponente `components/agents/create-bot-dialog/**` noch
   * nicht; bis dahin nimmt `CreateBotDialog` in dieser Datei die Aufgabe wahr. Wird
   * A30 nachgeliefert, wird nur dieser Import umgestellt — der Rest bleibt.
   */
  if (getT3Flag("mascot")) {
    return (
      <CreateBotDialog
        activeCompanyId={activeCompanyId}
        onClose={onClose}
        onCreated={onCreated}
        open={open}
      />
    );
  }

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="max-w-xl">
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

/**
 * „Neuen Bot erstellen" — der direkte Weg in den Chat (A30, Idee I7).
 *
 * Anders als der Assistent fragt er nur das Nötigste: Name, Maskottchen-Avatar und
 * welche CLI der Bot fährt. Danach wird der Bot angelegt, bekommt seinen Avatar
 * gespeichert und der Aufrufer öffnet direkt sein Gespräch.
 *
 * Der Avatar wird per Zufall gewürfelt (A31) und sofort am Server gespeichert, damit
 * er dauerhaft ist. Schlägt das Speichern fehl, bleibt der Bot trotzdem bestehen —
 * der Fehler wird gemeldet, aber der Bot geht nicht verloren.
 */
function CreateBotDialog({
  open,
  onClose,
  onCreated,
  activeCompanyId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agentId: string) => void;
  activeCompanyId: string | null;
}) {
  const createAgent = useMutation(createAgentMutationOptions(queryClient));
  const [name, setName] = useState("");
  const [cli, setCli] = useState<ManagedCliKind>("antigravity");
  const [avatar, setAvatar] = useState(() => randomAgentAvatar());
  const [touched, setTouched] = useState(false);

  const nameError = !name.trim() && touched ? "Name fehlt." : null;

  const close = () => {
    setName("");
    setTouched(false);
    setAvatar(randomAgentAvatar());
    onClose();
  };

  const create = async () => {
    setTouched(true);
    const trimmed = name.trim();
    if (!trimmed) return;
    if (createAgent.isPending) return;

    const chosenCli = cli === "hermes" ? "antigravity" : cli;
    const agent = await createAgent.mutateAsync(
      agentInputFrom({
        ...emptyAgentForm,
        name: trimmed,
        visibility: "private",
        endpoint: "",
        authValue: "",
        cliEngineKind:
          cli === "hermes"
            ? null
            : (cli as "antigravity" | "codex" | "claude" | "freebuff"),
        chosenCli,
        freebuffEnabled: cli === "freebuff",
      }),
    );

    // Der Avatar wird dauerhaft gespeichert; ein Fehler darf den Bot nicht verwerfen.
    try {
      await setAgentAvatar(agent.id, {
        shape: avatar.shape,
        color: avatar.color,
      });
    } catch (error) {
      console.warn("[create-bot] avatar save failed:", error);
    }

    if (activeCompanyId) {
      try {
        await addAgentToCompany(activeCompanyId, agent.id);
      } catch (error) {
        console.error("[create-bot] roster assignment failed:", error, {
          agentId: agent.id,
          companyId: activeCompanyId,
        });
      }
    }

    close();
    onCreated(agent.id);
  };

  return (
    <Dialog onOpenChange={(next) => !next && close()} open={open}>
      <DialogContent className="max-w-md">
        <DialogTitle>Neuen Bot erstellen</DialogTitle>
        <DialogBody className="space-y-4">
          <div className="flex items-center gap-3.5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40">
              <BotAvatar
                color={avatar.color}
                frozen
                name={name || "Neuer Bot"}
                shape={avatar.shape as Parameters<typeof BotAvatar>[0]["shape"]}
                size={48}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {name.trim() || "Neuer Bot"}
              </p>
              <button
                className="mt-0.5 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setAvatar(randomAgentAvatar())}
                type="button"
              >
                Anderes Maskottchen
              </button>
            </div>
          </div>

          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor="create-bot-name">
              Name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              autoFocus
              aria-invalid={nameError ? true : undefined}
              id="create-bot-name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isComposing(event)) {
                  event.preventDefault();
                  void create();
                }
              }}
              placeholder="z. B. Research Bot"
              value={name}
            />
            {nameError ? <FieldError errors={[{ message: nameError }]} /> : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="create-bot-cli">CLI</FieldLabel>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              id="create-bot-cli"
              onChange={(event) => setCli(event.target.value as ManagedCliKind)}
              value={cli}
            >
              <option value="antigravity">Antigravity CLI</option>
              <option value="freebuff">Freebuff</option>
              <option value="claude">Claude CLI</option>
              <option value="codex">Codex CLI</option>
              <option value="hermes">Hermes</option>
            </select>
          </Field>

          {createAgent.error ? (
            <p className="text-sm text-destructive" role="alert">
              {createAgent.error.message}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={close} type="button" variant="ghost">
            Abbrechen
          </Button>
          <Button
            disabled={createAgent.isPending}
            onClick={() => void create()}
            type="button"
          >
            {createAgent.isPending ? "Wird erstellt…" : "Erstellen & Chat öffnen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Phase B – Agent erstellen (Wizard)
 * Schritt 6: Seite Profil: Name, Headline, Rolle, Beschreibung, Avatar.
 * Schritt 7: Seite Modellwahl: Die 5 CLIs als Karten (Heavy, Flash, Computer Use, Data Analysis, Self-Improving) mit Status „installiert/fehlt“.
 * Schritt 8: Auto-Installation + Auto-Login: Nach Wahl startet sofort die Installation (Schritt 4) und danach automatisch der Login-Flow der CLI (Browserfenster/Device-Code wird angezeigt). Bei Hermes stattdessen API-Key-Feld.
 * Schritt 9: Eigenes Konto pro Bot.
 */
const STEPS = ["profile", "model", "setup", "account"] as const;
type StepName = (typeof STEPS)[number];

const STEP_LABELS: Record<StepName, string> = {
  profile: "Profil",
  model: "Modellwahl",
  setup: "Installation & Login",
  account: "Konto",
};

/** Seite Profil: Name (Pflichtfeld), Headline, Rolle, Beschreibung, Avatar. */
const profileSchema = agentFormSchema.pick({
  name: true,
  headline: true,
  role: true,
  description: true,
});

/**
 * Phase B Schritt 9: Account-Step Schema.
 * Jeder Agent bekommt ein eigenes CLI-Konto mit eigenem Config-Verzeichnis.
 */
const accountSchema = agentFormSchema.pick({ accountEmail: true, accountDisplayName: true });

type ProfileField = keyof typeof profileSchema.shape;
type AccountField = keyof typeof accountSchema.shape;

/** First message per field, or nothing when the step parses. */
function profileIssues(
  values: AgentFormValues,
): Partial<Record<ProfileField, string>> {
  const parsed = profileSchema.safeParse(values);
  if (parsed.success) return {};
  const issues: Partial<Record<ProfileField, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as ProfileField | undefined;
    if (field && !issues[field]) issues[field] = issue.message;
  }
  return issues;
}

/**
 * Account-Step Validierung.
 * E-Mail ist optional, aber wenn angegeben muss sie gültig sein.
 */
function accountIssues(
  values: AgentFormValues,
): Partial<Record<AccountField, string>> {
  const issues: Partial<Record<AccountField, string>> = {};
  if (values.accountEmail && values.accountEmail !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(values.accountEmail)) {
      issues.accountEmail = "Ungültige E-Mail-Adresse";
    }
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
  const [family, setFamily] = useState<AgentModelFamily>("antigravity");
  const [selectedCli, setSelectedCli] = useState<ManagedCliKind>("antigravity");
  const [cloud, setCloud] = useState<CloudAgentDraft>(() => emptyCloudDraft());
  const [cloudError, setCloudError] = useState<string | null>(null);
  /** Set once the coworker exists, so a failed provider save retries without a second coworker. */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [savingCloud, setSavingCloud] = useState(false);
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
  /** Cloud-Agents laufen beim Anbieter: keine CLI, dafür Anbieter und Keys im Setup-Schritt. */
  const isCloud = family === "cloud";
  const set = <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const handleSelectCli = (kind: ManagedCliKind) => {
    setSelectedCli(kind);
    if (kind === "antigravity") {
      set("cliEngineKind", "antigravity");
      set("freebuffEnabled", false);
      setFamily("antigravity");
    } else if (kind === "freebuff") {
      set("cliEngineKind", "freebuff");
      set("freebuffEnabled", true);
      setFamily("antigravity");
    } else if (kind === "claude") {
      set("cliEngineKind", "claude");
      set("freebuffEnabled", false);
      setFamily("claude");
    } else if (kind === "codex") {
      set("cliEngineKind", "codex");
      set("freebuffEnabled", false);
      setFamily("chatgpt");
    } else if (kind === "hermes") {
      set("cliEngineKind", null);
      set("freebuffEnabled", false);
      setFamily("connect");
    }
  };

  /** Cloud-Agent statt CLI: keine Engine, Familie "cloud", Formular im Setup-Schritt. */
  const handleSelectCloud = () => {
    set("cliEngineKind", null);
    set("freebuffEnabled", false);
    setFamily("cloud");
    setCloudError(null);
  };

  const profileErrors = tried ? profileIssues(values) : {};
  const accountErrors = tried ? accountIssues(values) : {};
  const stepValid = (): boolean => {
    if (STEPS[step] === "profile") {
      return profileSchema.safeParse(values).success;
    }
    if (STEPS[step] === "model") {
      return true;
    }
    if (STEPS[step] === "setup") {
      return isCloud ? cloudDraftIssue(cloud) === null : true;
    }
    if (STEPS[step] === "account") {
      return accountSchema.safeParse(values).success;
    }
    return true;
  };

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setTried(false);
    setStep(to);
  };

  const createAndFinish = async () => {
    if (!stepValid()) {
      setTried(true);
      if (isCloud) setCloudError(cloudDraftIssue(cloud));
      return;
    }
    const effectiveCliKind =
      values.cliEngineKind !== null
        ? values.cliEngineKind
        : selectedCli === "hermes"
          ? null
          : selectedCli;

    const chosenCli = isCloud ? null : selectedCli;

    /*
     * Der Bot entsteht vor seiner Anbieter-Konfiguration. `createdId` hält ihn fest, damit ein
     * fehlgeschlagenes Speichern (falscher Key, Anbieter nicht erreichbar) wiederholt werden kann,
     * ohne einen zweiten Bot anzulegen.
     */
    let agentId = createdId;
    if (!agentId) {
      const agent = await createAgent.mutateAsync(
        agentInputFrom({
          ...values,
          cliEngineKind: isCloud ? null : effectiveCliKind,
          freebuffEnabled: !isCloud && selectedCli === "freebuff",
          chosenCli,
          visibility: "private",
          endpoint: "",
          authValue: "",
        }),
      );
      agentId = agent.id;
      if (values.avatarUrl) {
        setBotAvatarOverride(agentId, values.avatarUrl);
      }
      provisionAgentModels(agentId, family);
      if (!isCloud) {
        setAgentCliDefault(agentId, selectedCli === "hermes" ? "antigravity" : (selectedCli as CliTarget));
      }
      if (isShellFamily(family)) {
        provisionAgentShell(
          agentId,
          family,
          family === "manus" ? "cloud" : "local",
        );
        if (family === "chatgpt") {
          ensureZgptProfileForAgent(agentId, values.name.trim() || agent.name);
        }
      }
      if (isCloud) setCreatedId(agentId);
    }
    if (isCloud) {
      const issue = cloudDraftIssue(cloud);
      if (issue) {
        setCloudError(issue);
        return;
      }
      setSavingCloud(true);
      try {
        await saveCloudAgentConfig(agentId, cloud);
        setCloud((draft) => ({ ...draft, apiKey: "", webhookUrl: "", webhookKey: "" }));
      } catch (error) {
        setCloudError(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        setSavingCloud(false);
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
      const picked = await onAssignmentNeeded(agentId);
      if (!picked) {
        // The user dismissed the picker; do not silently leave the bot orphaned.
        onAssignmentFailed(agentId, null);
        return;
      }
      try {
        await addAgentToCompany(picked, agentId);
      } catch (err) {
        console.error("[create-agent] roster assignment failed:", err, {
          agentId,
          companyId: picked,
        });
        onAssignmentFailed(agentId, picked);
        return;
      }
    } else {
      try {
        await addAgentToCompany(activeCompanyId, agentId);
      } catch (err) {
        console.error("[create-agent] roster assignment failed:", err, {
          agentId,
          companyId: activeCompanyId,
        });
        onAssignmentFailed(agentId, activeCompanyId);
        return;
      }
    }
    onCreated(agentId);
  };

  const advance = async () => {
    if (!stepValid()) {
      setTried(true);
      return;
    }
    if (!last) {
      go(step + 1);
      return;
    }
    await createAndFinish();
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
          {/* Step indicator for multi-step wizard */}
          {STEPS.length > 1 && (
            <div className="text-xs text-muted-foreground mb-2">
              Schritt {step + 1} von {STEPS.length}:{" "}
              {STEPS[step] === "setup" && isCloud
                ? "Cloud-Anbieter"
                : STEP_LABELS[STEPS[step]]}
            </div>
          )}
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
                    {STEPS[step] === "profile" ? (
                      <ProfileStep
                        errors={profileErrors}
                        set={set}
                        values={values}
                      />
                    ) : null}
                    {STEPS[step] === "model" ? (
                      <ModelStep
                        isCloud={isCloud}
                        selectedCli={selectedCli}
                        onSelectCli={handleSelectCli}
                        onSelectCloud={handleSelectCloud}
                      />
                    ) : null}
                    {STEPS[step] === "setup" ? (
                      isCloud ? (
                        <CloudSetupStep
                          draft={cloud}
                          error={cloudError}
                          onChange={(next) => {
                            setCloud(next);
                            setCloudError(null);
                          }}
                        />
                      ) : (
                        <SetupStep
                          selectedCli={selectedCli}
                        />
                      )
                    ) : null}
                    {STEPS[step] === "account" ? (
                      <AccountStep
                        errors={accountErrors}
                        set={set}
                        values={values}
                      />
                    ) : null}
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
              {step === 0 ? "Abbrechen" : "Zurück"}
            </Button>
            <div className="flex gap-2">
              {step === 0 ? (
                <Button
                  disabled={createAgent.isPending}
                  onClick={() => void createAndFinish()}
                  type="button"
                  variant="outline"
                >
                  {createAgent.isPending ? "Wird erstellt…" : "Direkt erstellen"}
                </Button>
              ) : null}
              <Button
                disabled={createAgent.isPending || savingCloud}
                onClick={() => void advance()}
                type="button"
              >
                {last
                  ? createAgent.isPending || savingCloud
                    ? "Wird erstellt…"
                    : isCloud
                      ? "Cloud-Agent anlegen"
                      : "Agent erstellen"
                  : "Weiter"}
              </Button>
            </div>
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

const AVATAR_PRESETS = [
  { id: "default", label: "Standard", src: "/bots/default.png" },
  { id: "cto", label: "CTO", src: "/bots/cto.png" },
  { id: "analysis", label: "Analysis", src: "/bots/analysis.png" },
  { id: "connect", label: "Connect", src: "/bots/connect.png" },
  { id: "consensus", label: "Consensus", src: "/bots/consensus.png" },
  { id: "flux", label: "Flux", src: "/bots/flux.png" },
  { id: "hyper", label: "Hyper", src: "/bots/hyper.png" },
  { id: "spark", label: "Spark", src: "/bots/spark.png" },
] as const;

const ROLE_SUGGESTIONS = [
  "Recherche & Analyse",
  "Software-Entwicklung",
  "Finanzen & Krypto",
  "Marketing & Content",
  "Support & Assistenz",
  "Trading",
] as const;

function ProfileStep({
  values,
  errors,
  set,
}: {
  values: AgentFormValues;
  errors: Partial<Record<ProfileField, string>>;
  set: <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const onAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    setAvatarError(null);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      set("avatarUrl", dataUrl);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    }
  };

  const currentAvatarSrc = values.avatarUrl || "/bots/default.png";

  return (
    <StepItem name="profile">
      <QuestionnaireTitle>Neuer Agent – Profil</QuestionnaireTitle>
      <QuestionnaireDescription>
        Lege Identität, Rolle und Avatar deines Agenten fest.
      </QuestionnaireDescription>

      {/* Avatar-Bereich */}
      <div className="rounded-xl border border-border bg-card/60 p-3.5 space-y-3">
        <div className="flex items-center gap-3.5">
          <div className="relative size-14 shrink-0 rounded-full border border-border overflow-hidden bg-muted shadow-sm">
            <img
              src={currentAvatarSrc}
              alt={values.name || "Agent Avatar"}
              className="size-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "/bots/default.png";
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">
              {values.name.trim() || "Neuer Agent"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {values.headline?.trim() || values.role?.trim() || "Wähle oder lade einen Avatar hoch"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onAvatarFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconUpload className="size-3.5" />
              Upload
            </Button>
            {values.avatarUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => set("avatarUrl", "")}
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        {avatarError ? (
          <p className="text-xs text-destructive" role="alert">
            {avatarError}
          </p>
        ) : null}

        {/* Preset-Avatar Auswahl */}
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-1.5">
            Connect Vorlagen
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AVATAR_PRESETS.map((preset) => {
              const isSelected =
                values.avatarUrl === preset.src ||
                (!values.avatarUrl && preset.id === "default");
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.label}
                  onClick={() => set("avatarUrl", preset.src)}
                  className={cn(
                    "relative size-9 rounded-full overflow-hidden border transition-all p-0.5",
                    isSelected
                      ? "ring-2 ring-foreground border-foreground scale-105"
                      : "border-border/60 opacity-70 hover:opacity-100 hover:border-foreground/50",
                  )}
                >
                  <img
                    src={preset.src}
                    alt={preset.label}
                    className="size-full rounded-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <FieldGroup className="gap-3.5">
        {/* Name */}
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="create-agent-name">
            Name <span className="text-destructive">*</span>
          </FieldLabel>
          <Input
            autoFocus
            aria-invalid={errors.name ? true : undefined}
            id="create-agent-name"
            onChange={(event) => set("name", event.target.value)}
            placeholder="z. B. Research Bot"
            value={values.name}
          />
          {errors.name ? (
            <FieldError errors={[{ message: errors.name }]} />
          ) : null}
        </Field>

        {/* Headline */}
        <Field data-invalid={errors.headline ? true : undefined}>
          <FieldLabel htmlFor="create-agent-headline">
            Headline <span className="text-muted-foreground font-normal">(optional)</span>
          </FieldLabel>
          <Input
            id="create-agent-headline"
            onChange={(event) => set("headline", event.target.value)}
            placeholder="z. B. Senior Market & Competitor Research"
            value={values.headline ?? ""}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Kurzer Untertitel oder Spezialisierung des Agenten.
          </p>
        </Field>

        {/* Rolle */}
        <Field data-invalid={errors.role ? true : undefined}>
          <FieldLabel htmlFor="create-agent-role">
            Rolle <span className="text-muted-foreground font-normal">(optional)</span>
          </FieldLabel>
          <Input
            id="create-agent-role"
            onChange={(event) => set("role", event.target.value)}
            placeholder="z. B. Recherche & Analyse"
            value={values.role ?? ""}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ROLE_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => set("role", suggestion)}
                className="text-[11px] rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Field>

        {/* Beschreibung */}
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="create-agent-description">
            Beschreibung <span className="text-muted-foreground font-normal">(optional)</span>
          </FieldLabel>
          <Textarea
            id="create-agent-description"
            rows={3}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Beschreibe die Aufgaben, Arbeitsweise und Schwerpunkte dieses Agenten..."
            value={values.description ?? ""}
            className="text-xs leading-relaxed"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Definiert Verhalten, Fähigkeiten und Aufgabenbereich des Agenten.
          </p>
        </Field>
      </FieldGroup>
    </StepItem>
  );
}

/**
 * Phase B Schritt 7: Seite Modellwahl (Die 5 CLIs als Karten).
 *
 * 1. Heavy: Antigravity CLI (Google Gemini 3.8 / 2.5 Pro & Flash via Google-OAuth)
 * 2. Flash: Freebuff (npm install -g freebuff, Coding & Browser-Use)
 * 3. Computer Use: Claude CLI (Anthropic Claude Code, Desktop GUI & Screenshots)
 * 4. Data Analysis: Codex CLI (OpenAI Codex / ChatGPT, Datenanalyse & Python)
 * 5. Self-Improving: Hermes (Nous Research Agent via API-Key, WSL/Bash)
 */
type CliCardOption = {
  kind: ManagedCliKind;
  tier: "Heavy" | "Flash" | "Computer Use" | "Data Analysis" | "Self-Improving";
  name: string;
  badge: string;
  tagline: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  recommended?: boolean;
};

const CLI_CARDS: CliCardOption[] = [
  {
    kind: "antigravity",
    tier: "Heavy",
    name: "Antigravity CLI",
    badge: "Heavy · Browser Use",
    tagline: "Vollwertiges Modell für komplexe Planungen, Coding & Multi-Tab Browser-Steuerung",
    description: "Google Gemini 3.8 / 2.5 Pro & Flash via Google-OAuth. Ideal für komplexe Workflows und tiefe Code-Refactors.",
    icon: IconRocket,
    badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    recommended: true,
  },
  {
    kind: "freebuff",
    tier: "Flash",
    name: "Freebuff",
    badge: "Flash · Browser Use",
    tagline: "Ultra-schneller, leichtgewichtiger Coding-Agent mit integrierter Browser-Steuerung",
    description: "Kostenlose Alternative mit automatischer Web-Recherche und Browser-Automatisierung ohne Token-Kosten.",
    icon: IconBolt,
    badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    kind: "claude",
    tier: "Computer Use",
    name: "Claude CLI",
    badge: "Computer Use",
    tagline: "Anthropic Claude für visuelle Desktop-Interaktion und GUI-Steuerung",
    description: "Autonome Interaktion über Screenshots, Mausklicks und Tastatureingaben via Claude Code CLI.",
    icon: IconDeviceDesktop,
    badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  {
    kind: "codex",
    tier: "Data Analysis",
    name: "Codex CLI",
    badge: "Data Analysis",
    tagline: "OpenAI Codex / ChatGPT CLI für Python-Datenanalyse & Skript-Ausführung",
    description: "Direkter ChatGPT-Login für Datenanalysen, Tabellen-Auswertungen und automatisierte Code-Ausführung.",
    icon: IconChartBar,
    badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    kind: "hermes",
    tier: "Self-Improving",
    name: "Hermes",
    badge: "Self-Improving",
    tagline: "Selbstverbessernder Nous-Research-Agent per API-Key (WSL/Bash)",
    description: "Lokale Ausführung in WSL/Bash. Passt sich an, lernt aus Ausführungen und optimiert eigene Prompts.",
    icon: IconBrain,
    badgeColor: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
];

function ModelStep({
  selectedCli,
  onSelectCli,
  isCloud,
  onSelectCloud,
}: {
  selectedCli: ManagedCliKind;
  onSelectCli: (kind: ManagedCliKind) => void;
  isCloud: boolean;
  onSelectCloud: () => void;
}) {
  const cliStatus = useQuery(cliManagerStatusQuery());
  const clis = cliStatus.data?.clis ?? [];

  return (
    <StepItem name="model">
      <QuestionnaireTitle>Seite Modellwahl</QuestionnaireTitle>
      <QuestionnaireDescription>
        Wähle die passende CLI-Engine für diesen Agenten. Die 5 CLIs laufen
        lokal auf deinem PC und sind für unterschiedliche Rollen optimiert.
      </QuestionnaireDescription>

      <div className="mt-3 space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
        {/* Cloud-Agent: läuft beim Anbieter und braucht keine lokale CLI. */}
        <button
          type="button"
          onClick={onSelectCloud}
          className={cn(
            "w-full text-left rounded-xl border p-3.5 transition-all relative flex flex-col gap-2",
            isCloud
              ? "border-primary bg-primary/[0.04] ring-2 ring-primary/25 shadow-sm"
              : "border-border/70 bg-card/60 hover:bg-muted/40 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg border shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20">
                <IconCloud className="size-4" />
              </div>
              <span className="font-semibold text-sm text-foreground shrink-0">
                Cloud-Agent
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20">
                Cloud
              </span>
            </div>
            <div
              className={cn(
                "size-4 rounded-full border flex items-center justify-center transition-colors ml-1",
                isCloud
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30",
              )}
            >
              {isCloud ? (
                <div className="size-1.5 rounded-full bg-background" />
              ) : null}
            </div>
          </div>
          <div className="space-y-0.5 pl-8">
            <p className="text-xs font-medium text-foreground/90">
              Muse / Grok Bot / OpenAI-kompatibel
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Läuft beim Anbieter statt auf deinem PC. Antworten kommen per
              Abfrage, Keys bleiben auf dem Connect-Server.
            </p>
          </div>
        </button>
        {CLI_CARDS.map((card) => {
          const isSelected = selectedCli === card.kind;
          const status = clis.find((c) => c.kind === card.kind);
          // If query has returned, use actual status; otherwise assume installed if on local machine
          const isInstalled = status ? status.installed : true;
          const version = status?.version;
          const statusDetail = status?.statusDetail;
          const Icon = card.icon;

          return (
            <button
              key={card.kind}
              type="button"
              onClick={() => onSelectCli(card.kind)}
              className={cn(
                "w-full text-left rounded-xl border p-3.5 transition-all relative flex flex-col gap-2",
                isSelected
                  ? "border-primary bg-primary/[0.04] ring-2 ring-primary/25 shadow-sm"
                  : "border-border/70 bg-card/60 hover:bg-muted/40 hover:border-border",
              )}
            >
              {/* Header: Tier + Name + Recommended + Status + Radio */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn("p-1.5 rounded-lg border shrink-0", card.badgeColor)}>
                    <Icon className="size-4" />
                  </div>
                  <span className="font-semibold text-sm text-foreground shrink-0">
                    {card.name}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0",
                      card.badgeColor,
                    )}
                  >
                    {card.tier}
                  </span>
                  {card.recommended ? (
                    <span className="text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                      Standard
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {cliStatus.isLoading ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <IconLoader2 className="size-3 animate-spin" /> prüft…
                    </span>
                  ) : isInstalled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      installiert
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                      <span className="size-1.5 rounded-full bg-rose-500" />
                      fehlt
                    </span>
                  )}

                  {/* Radio indicator */}
                  <div
                    className={cn(
                      "size-4 rounded-full border flex items-center justify-center transition-colors ml-1",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {isSelected ? (
                      <div className="size-1.5 rounded-full bg-background" />
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Tagline & Description */}
              <div className="space-y-0.5 pl-8">
                <p className="text-xs font-medium text-foreground/90">
                  {card.tagline}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {card.description}
                </p>
              </div>

              {/* Footer status / detail / version */}
              <div className="pl-8 pt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
                {version ? (
                  <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground">
                    {version.startsWith("v") ? version : `v${version}`}
                  </span>
                ) : null}
                {statusDetail && isInstalled ? (
                  <span className="text-muted-foreground/90 truncate max-w-[320px]">
                    Status: {statusDetail}
                  </span>
                ) : null}
                {!isInstalled && status?.installCommand ? (
                  <span className="truncate max-w-[320px]">
                    Installation: <code className="bg-muted px-1 py-0.5 rounded font-mono text-[9px]">{status.installCommand}</code>
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </StepItem>
  );
}

/** Cloud-Agent: Anbieter, URL und Keys — dieselben Felder wie in den Agent-Einstellungen. */
function CloudSetupStep({
  draft,
  error,
  onChange,
}: {
  draft: CloudAgentDraft;
  error: string | null;
  onChange: (next: CloudAgentDraft) => void;
}) {
  return (
    <StepItem name="setup">
      <QuestionnaireTitle>Cloud-Anbieter</QuestionnaireTitle>
      <QuestionnaireDescription>
        Nachrichten gehen an den Anbieter; Antworten erscheinen im Chat, sobald
        sie fertig sind. Keys bleiben verschlüsselt auf dem Connect-Server.
      </QuestionnaireDescription>
      <div className="mt-3">
        <CloudAgentFields draft={draft} error={error} onChange={onChange} />
      </div>
    </StepItem>
  );
}

/**
 * Phase B Schritt 8: Auto-Installation + Auto-Login.
 *
 * Nach Wahl der CLI startet sofort die Installation (Schritt 4) und danach
 * automatisch der Login-Flow der CLI (Browserfenster/Device-Code wird angezeigt).
 * Bei Hermes stattdessen API-Key-Feld.
 */
function SetupStep({
  selectedCli,
}: {
  selectedCli: ManagedCliKind;
}) {
  const cliStatus = useQuery(cliManagerStatusQuery());
  const clis = cliStatus.data?.clis ?? [];
  const currentCli = clis.find((c) => c.kind === selectedCli);
  const card = CLI_CARDS.find((c) => c.kind === selectedCli) || CLI_CARDS[0];
  const Icon = card.icon;

  const [installJobId, setInstallJobId] = useState<string | null>(null);
  const [installTriggered, setInstallTriggered] = useState(false);
  const [loginTriggered, setLoginTriggered] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [hermesKey, setHermesKey] = useState("");
  const [hermesSaving, setHermesSaving] = useState(false);
  const [hermesSavedMsg, setHermesSavedMsg] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  // Poll install job if active
  const jobQuery = useQuery(cliInstallJobQuery(installJobId));
  const job = jobQuery.data?.job;

  // Poll login session if active
  const loginSessionQuery = useQuery(cliLoginSessionQuery(loginTriggered ? selectedCli : null));
  const loginSession = loginSessionQuery.data?.session;

  const isInstalled = currentCli ? currentCli.installed : false;
  const isLoggedIn = currentCli ? currentCli.loggedIn : false;

  // 1. Auto-Installation: Start immediately if not installed
  useEffect(() => {
    if (!cliStatus.isLoading && currentCli && !currentCli.installed && !installTriggered) {
      setInstallTriggered(true);
      startCliInstall(selectedCli)
        .then((res) => {
          if (res?.job?.id) setInstallJobId(res.job.id);
        })
        .catch((err) => console.error("[cli-install] failed:", err));
    }
  }, [cliStatus.isLoading, currentCli?.installed, selectedCli, installTriggered]);

  // When install completes, refresh CLI status
  useEffect(() => {
    if (job?.status === "completed") {
      void cliStatus.refetch();
    }
  }, [job?.status]);

  // 2. Auto-Login: Start immediately once installed (if not Hermes and not logged in)
  useEffect(() => {
    if (isInstalled && !isLoggedIn && selectedCli !== "hermes" && !loginTriggered) {
      setLoginTriggered(true);
      startCliLoginFlow(selectedCli)
        .catch((err) => console.error("[cli-login] failed:", err));
    }
  }, [isInstalled, isLoggedIn, selectedCli, loginTriggered]);

  // Auto-polling when waiting for user to complete login in browser
  useEffect(() => {
    if (isInstalled && !isLoggedIn && selectedCli !== "hermes") {
      const interval = setInterval(() => {
        void cliStatus.refetch();
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [isInstalled, isLoggedIn, selectedCli]);

  const handleManualLogin = async () => {
    setLoginTriggered(true);
    await startCliLoginFlow(selectedCli);
    void cliStatus.refetch();
  };

  const handleSaveHermesKey = async () => {
    if (!hermesKey.trim()) return;
    setHermesSaving(true);
    try {
      const res = await saveHermesApiKey(hermesKey.trim());
      setHermesSavedMsg(res.message || "Hermes API-Key erfolgreich gespeichert!");
      await cliStatus.refetch();
    } catch (err) {
      setHermesSavedMsg(`Fehler: ${String(err)}`);
    } finally {
      setHermesSaving(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const progressPercent = job?.progress ?? (isInstalled ? 100 : 25);

  return (
    <StepItem name="setup">
      <QuestionnaireTitle>Auto-Installation & CLI-Login</QuestionnaireTitle>
      <QuestionnaireDescription>
        Die gewählte Engine wird automatisch eingerichtet und mit deinem Konto verknüpft.
      </QuestionnaireDescription>

      <div className="mt-4 space-y-4">
        {/* Selected CLI Banner */}
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 p-3.5">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg border shrink-0", card.badgeColor)}>
              <Icon className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">{card.name}</span>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider", card.badgeColor)}>
                  {card.tier}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{card.tagline}</p>
            </div>
          </div>
        </div>

        {/* Schritt 1: Auto-Installation Status */}
        <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                1
              </span>
              <span className="text-xs font-semibold text-foreground">
                Installation der CLI
              </span>
            </div>

            {isInstalled ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <IconCheck className="size-3.5" />
                Bereits installiert
              </span>
            ) : job?.status === "running" || installTriggered ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium">
                <IconLoader2 className="size-3.5 animate-spin" />
                Wird installiert ({progressPercent}%)
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Warten auf Start…</span>
            )}
          </div>

          {!isInstalled ? (
            <div className="space-y-2">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{job?.step || "Installationsskript wird ausgeführt..."}</span>
                {job?.logs?.length ? (
                  <button
                    type="button"
                    onClick={() => setShowLogs(!showLogs)}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    <IconTerminal2 className="size-3" />
                    {showLogs ? "Logs ausblenden" : "Logs anzeigen"}
                  </button>
                ) : null}
              </div>

              {showLogs && job?.logs?.length ? (
                <div className="mt-2 max-h-36 overflow-y-auto rounded-lg bg-black/90 p-2.5 font-mono text-[10px] text-emerald-400 border border-border/40 space-y-0.5">
                  {job.logs.map((line, i) => (
                    <div key={i} className="leading-tight">{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Status: {currentCli?.statusDetail || "Einsatzbereit auf diesem System"}</span>
              {currentCli?.version ? (
                <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded border border-border/50">
                  {currentCli.version}
                </code>
              ) : null}
            </div>
          )}
        </div>

        {/* Schritt 2: Auto-Login Flow (oder Hermes API-Key) */}
        <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                2
              </span>
              <span className="text-xs font-semibold text-foreground">
                {selectedCli === "hermes" ? "API-Key Konfiguration" : "CLI-Login & Authentifizierung"}
              </span>
            </div>

            {isLoggedIn ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <IconCheck className="size-3.5" />
                Angemeldet
              </span>
            ) : selectedCli === "hermes" ? (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Schlüssel erforderlich
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Login erforderlich
              </span>
            )}
          </div>

          {selectedCli === "hermes" ? (
            /* Hermes: API-Key Eingabefeld */
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Hermes benötigt einen API-Key (z. B. von Nous Research oder OpenRouter).
                Der Schlüssel wird sicher lokal im Tresor verschlüsselt.
              </p>

              <div className="space-y-2">
                <FieldLabel htmlFor="hermes-api-key" className="text-xs">
                  Hermes / Nous API-Key
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="hermes-api-key"
                    type="password"
                    placeholder="sk-or-v1-... oder Ihr API-Key"
                    value={hermesKey}
                    onChange={(e) => setHermesKey(e.target.value)}
                    className="text-xs font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={hermesSaving || !hermesKey.trim()}
                    onClick={handleSaveHermesKey}
                    className="shrink-0 text-xs"
                  >
                    {hermesSaving ? (
                      <IconLoader2 className="size-3.5 animate-spin" />
                    ) : (
                      <IconKey className="size-3.5 mr-1" />
                    )}
                    Speichern
                  </Button>
                </div>
                {hermesSavedMsg ? (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {hermesSavedMsg}
                  </p>
                ) : null}
              </div>
            </div>
          ) : isLoggedIn ? (
            /* Eingeloggt: Erfolgsmeldung */
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  Konto erfolgreich verbunden
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {currentCli?.statusDetail || "Zugangsdaten sind aktiv und verifiziert."}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleManualLogin}
                className="text-xs text-muted-foreground hover:text-foreground h-7"
              >
                <IconRefresh className="size-3 mr-1" />
                Erneut anmelden
              </Button>
            </div>
          ) : (
            /* Nicht eingeloggt: Browserfenster + Device-Code Anzeige */
            <div className="space-y-3 pt-1">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <IconExternalLink className="size-4 text-primary shrink-0" />
                  <span>Browserfenster für die Anmeldung geöffnet</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Bitte bestätige die Autorisierung im geöffneten Browserfenster. Sobald die Anmeldung
                  abgeschlossen ist, schaltet die Anzeige automatisch auf grün.
                </p>

                {/* Device-Code Card falls vorhanden */}
                {loginSession?.deviceCode ? (
                  <div className="p-2.5 rounded-lg bg-background/80 border border-border flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] text-muted-foreground block font-medium uppercase tracking-wider">
                        Device-Code:
                      </span>
                      <code className="text-sm font-mono font-bold text-primary tracking-wider">
                        {loginSession.deviceCode}
                      </code>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyCode(loginSession.deviceCode!)}
                      className="text-xs h-7"
                    >
                      <IconCopy className="size-3 mr-1" />
                      {copiedCode ? "Kopiert!" : "Kopieren"}
                    </Button>
                  </div>
                ) : null}

                {/* Aktions-Buttons: URL öffnen oder Login neu anstoßen */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {loginSession?.authUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => window.open(loginSession.authUrl!, "_blank")}
                      className="text-xs h-8"
                    >
                      <IconExternalLink className="size-3.5 mr-1" />
                      Anmeldeseite öffnen
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleManualLogin}
                    className="text-xs h-8"
                  >
                    <IconRefresh className="size-3.5 mr-1" />
                    Browserfenster erneut öffnen
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-1">
                <span className="size-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                <span>Warte auf Bestätigung im Browser (wird automatisch erkannt)…</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </StepItem>
  );
}

/**
 * Phase B Schritt 9: AccountStep - Eigenes Konto pro Bot.
 *
 * Jeder Agent bekommt ein eigenes CLI-Konto mit eigenem Config-Verzeichnis.
 * Die eingeloggte E-Mail wird am Agenten gespeichert und angezeigt.
 *
 * Dies integriert die Mehrkonten-Software aus:
 * C:\Users\Kunc GmbH\Documents\001_Mini Apps\000_Codex Start
 *
 * Funktionen:
 * - CLI-Konto auswählen (Antigravity, Codex, Claude, etc.)
 * - Eigene Config-Verzeichnis pro Agent
 * - E-Mail des eingeloggten Kontos speichern
 * - Display-Name für das Konto
 */
function AccountStep({
  values,
  errors,
  set,
}: {
  values: AgentFormValues;
  errors: Partial<Record<AccountField, string>>;
  set: <K extends keyof AgentFormValues>(
    key: K,
    value: AgentFormValues[K],
  ) => void;
}) {
  const codexAccounts = useQuery(codexAccountsQueryOptions());
  const availableEmails = codexAccounts.data?.availableEmails ?? [];

  return (
    <StepItem name="account">
      <QuestionnaireTitle>Eigenes Konto pro Bot</QuestionnaireTitle>
      <QuestionnaireDescription>
        Jeder Agent bekommt ein eigenes CLI-Konto mit eigenem Config-Verzeichnis.
        Die eingeloggte E-Mail wird am Agenten gespeichert und im Terminal angezeigt.
      </QuestionnaireDescription>
      <FieldGroup>
        <Field data-invalid={errors.accountEmail ? true : undefined}>
          <FieldLabel htmlFor="create-agent-email">
            Konto-E-Mail{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </FieldLabel>
          <Input
            autoFocus
            aria-invalid={errors.accountEmail ? true : undefined}
            id="create-agent-email"
            onChange={(event) => set("accountEmail", event.target.value)}
            placeholder="z.B. dailyfunde.yt@gmail.com"
            value={values.accountEmail ?? ""}
            type="email"
          />
          {errors.accountEmail ? (
            <FieldError errors={[{ message: errors.accountEmail }]} />
          ) : null}
          {availableEmails.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Gefundene Konten aus 000_Codex Start:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableEmails.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      set("accountEmail", acc.email);
                      if (!values.accountDisplayName) {
                        set("accountDisplayName", acc.appName || acc.email.split("@")[0]);
                      }
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] border transition-colors",
                      values.accountEmail === acc.email
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 hover:bg-muted border-border text-foreground",
                    )}
                  >
                    {acc.label || acc.email}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Die E-Mail des CLI-Kontos. Wird für Google-Apps und Auth verwendet.
          </p>
        </Field>

        <Field>
          <FieldLabel htmlFor="create-agent-display-name">
            Anzeigename{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </FieldLabel>
          <Input
            id="create-agent-display-name"
            onChange={(event) => set("accountDisplayName", event.target.value)}
            placeholder="z.B. Research Bot Konto"
            value={values.accountDisplayName ?? ""}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Interner Name für dieses Konto, z.B. "{values.name || "Bot"}-Konto".
          </p>
        </Field>

        <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
          <h4 className="text-sm font-medium mb-2">Was passiert:</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              Agent erhält eigenes Config-Verzeichnis unter{" "}
              <code className="text-[10px] bg-muted px-1 rounded">
                %LOCALAPPDATA%\ConnectAgents\&lt;agentId&gt;
              </code>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              Eigene{" "}
              <code className="text-[10px] bg-muted px-1 rounded">
                CODEX_HOME
              </code>{" "}
              und{" "}
              <code className="text-[10px] bg-muted px-1 rounded">
                CLAUDE_CONFIG_DIR
              </code>{" "}
              Variablen im Terminal
            </li>
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              Google-Konto für Antigravity / Google-Apps wird gesetzt
            </li>
            <li className="flex items-start gap-2">
              <span className="text-foreground">•</span>
              Multi-Account-Support wie in Codex Start
            </li>
          </ul>
        </div>
      </FieldGroup>
    </StepItem>
  );
}
