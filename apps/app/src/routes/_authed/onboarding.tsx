import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import * as React from "react";
import useMeasure from "react-use-measure";
import { currentUserQueryOptions, needsOnboarding } from "@/lib/auth/queries";
import { completeOnboardingMutationOptions } from "@/lib/onboarding/mutations";
import { queryClient } from "@/query-client";
import { getFlag } from "@/contracts/v06/flags";
import { OnboardingFlow } from "@/v06/onboarding/OnboardingFlow";
import {
  OnboardingStepper,
  type StepItem,
  WelcomeStep,
  ThemeStepWrapper,
  CompanyStep,
  AgentWizardStep,
  StoreRecommendationsStep,
  CompleteStep,
} from "@/components/onboarding";
import { getCompany, listCompanies } from "@/lib/companies/store";
import { getT3Flag } from "@/lib/t3/contracts";
import { MachineOnboardingStep } from "@/components/onboarding/machines/machine-onboarding-step";

export const Route = createFileRoute("/_authed/onboarding")({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    // Erlaube Aufruf bei explizitem Restart (z. B. aus den Einstellungen ?restart=true)
    const searchObj = location.search as Record<string, unknown> | undefined;
    const isRestart =
      searchObj?.restart === "true" ||
      (typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("restart") === "true");

    if (!user || (!needsOnboarding(user) && !isRestart)) {
      throw redirect({ to: "/" });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  // Wenn Feature-Flag onboardingV2 aktiv ist, rendere den neuen 7-stufigen Ablauf
  if (getFlag("onboardingV2")) {
    return <OnboardingFlow />;
  }

  return <LegacyOnboardingComponent />;
}

/* ========================================================================= */
/* Legacy Onboarding (Wird gerendert wenn FLAGS_V06.onboardingV2 = false)     */
/* ========================================================================= */

/**
 * Die Schritte des alten Onboardings.
 *
 * Der Maschinen-Schritt (A26) kommt nur dazu, wenn das Flag `connect.t3.cuaMachines`
 * gesetzt ist. Deshalb ist die Liste dynamisch und die Schritte werden über ihre
 * **Id** adressiert, nicht über eine feste Nummer — sonst würde das Einschieben
 * jeden folgenden Schritt verschieben.
 */
const BASE_ONBOARDING_STEPS: StepItem[] = [
  { id: "welcome", title: "Willkommen", description: "Einführung in Connect" },
  { id: "theme", title: "Darstellung", description: "Design & Farbmodus" },
  { id: "company", title: "Unternehmen", description: "Firma wählen oder anlegen" },
  { id: "agent", title: "Erster Agent", description: "AI-Coworker konfigurieren" },
  { id: "tools", title: "Tools & Store", description: "Fähigkeiten & Module" },
];

/** Id des Maschinen-Schritts. */
const MACHINE_STEP_ID = "machines";

/** Die Reihenfolge der Schritte inklusive Maschinen-Schritt. */
function onboardingSteps(): StepItem[] {
  const steps = [...BASE_ONBOARDING_STEPS];
  if (getT3Flag("cuaMachines")) {
    steps.push({
      id: MACHINE_STEP_ID,
      title: "Maschine",
      description: "Lokale Maschine für Computer Use",
    });
  }
  steps.push({ id: "complete", title: "Fertig", description: "Workspace betreten" });
  return steps;
}

const variants = {
  initial: (direction: number) => ({ x: `${110 * direction}%`, opacity: 0 }),
  active: { x: "0%", opacity: 1 },
  exit: (direction: number) => ({ x: `${-110 * direction}%`, opacity: 0 }),
};

const STORAGE_STEP_KEY = "connect.onboarding.v2.stepIndex";

function LegacyOnboardingComponent() {
  const navigate = useNavigate();
  const completeMutation = useMutation(completeOnboardingMutationOptions(queryClient));

  /*
   * Die Schritteliste hängt am Flag `connect.t3.cuaMachines`: mit Flag kommt der
   * Maschinen-Schritt dazu, ohne Flag ist der Ablauf exakt wie vorher.
   *
   * Sie steht bewusst vor dem State, weil der Start-Schritt aus ihrer Länge
   * gelesen wird.
   */
  const steps = React.useMemo(() => onboardingSteps(), []);

  // State
  const [stepIndex, setStepIndex] = React.useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.sessionStorage.getItem(STORAGE_STEP_KEY);
    const n = Number(saved);
    return Number.isInteger(n) && n >= 0 && n < steps.length ? n : 0;
  });

  const [direction, setDirection] = React.useState(1);
  const [completedSteps, setCompletedSteps] = React.useState<number[]>([]);
  const [theme, setTheme] = React.useState<"dark" | "light" | "system">("dark");
  const [accentColor, setAccentColor] = React.useState("teal");
  const [companyId, setCompanyId] = React.useState<string | undefined>();
  const [agent, setAgent] = React.useState<{ id: string; name: string; role: string }>({
    id: "nexus",
    name: "Nexus",
    role: "General Workspace Copilot",
  });
  const [selectedTools, setSelectedTools] = React.useState<string[]>([
    "browser_use",
    "brain_memory",
    "cli_bridge",
    "drive_backup",
    "store_extensions",
  ]);

  const [leaving, setLeaving] = React.useState(false);
  const [ref, bounds] = useMeasure();

  const currentStepId = steps[stepIndex]?.id;
  const isCompleteStep = currentStepId === "complete";

  // Load existing state from /api/onboarding/state on mount
  React.useEffect(() => {
    fetch("/api/onboarding/state")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.themePreference) {
          setTheme(data.themePreference);
        }
        if (data.activeCompanyId) {
          setCompanyId(data.activeCompanyId);
        }
        if (data.step) {
          const idx = steps.findIndex((s) => s.id === data.step);
          if (idx > 0 && idx < steps.length) {
            setStepIndex(idx);
          }
        }
        if (Array.isArray(data.completedSteps)) {
          const indices = data.completedSteps
            .map((s: string) => steps.findIndex((step) => step.id === s))
            .filter((i: number) => i >= 0);
          setCompletedSteps((prev) => [...new Set([...prev, ...indices])]);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch onboarding state from server:", err);
      });
  }, []);

  // Sync state to server & sessionStorage
  const syncState = (nextIndex: number, markCompleted = false) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_STEP_KEY, String(nextIndex));
    }

    const nextCompleted = markCompleted
      ? [...new Set([...completedSteps, stepIndex])]
      : completedSteps;

    fetch("/api/onboarding/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: steps[nextIndex]?.id || "welcome",
        completedSteps: nextCompleted.map((i: number) => steps[i]?.id).filter(Boolean),
        isCompleted: nextIndex === steps.length - 1 && markCompleted,
        themePreference: theme,
        activeCompanyId: companyId,
        data: {
          accentColor,
          agent,
          selectedTools,
        },
      }),
    }).catch(() => {
      /* ignore sync error */
    });
  };

  const goToStep = (targetIndex: number) => {
    if (targetIndex === stepIndex) return;
    setDirection(targetIndex > stepIndex ? 1 : -1);
    setStepIndex(targetIndex);
    syncState(targetIndex);
  };

  const handleNext = () => {
    const nextIndex = Math.min(stepIndex + 1, steps.length - 1);
    setCompletedSteps((prev) => [...new Set([...prev, stepIndex])]);
    setDirection(1);
    setStepIndex(nextIndex);
    syncState(nextIndex, true);
  };

  const handleBack = () => {
    const prevIndex = Math.max(stepIndex - 1, 0);
    setDirection(-1);
    setStepIndex(prevIndex);
    syncState(prevIndex);
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleToggleTool = (toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId],
    );
  };

  const handleCompleteAll = () => {
    syncState(stepIndex, true);
    completeMutation.mutate(undefined, {
      onSuccess: () => {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(STORAGE_STEP_KEY);
        }
        setLeaving(true);
      },
    });
  };

  const currentCompanyName = React.useMemo(() => {
    if (!companyId) {
      const all = listCompanies();
      return all[0]?.name || "Standard-Unternehmen";
    }
    const c = getCompany(companyId);
    return c?.name || "Standard-Unternehmen";
  }, [companyId]);

  return (
    <motion.div
      animate={{ opacity: leaving ? 0 : 1 }}
      className={`min-h-svh overflow-hidden flex flex-col items-center justify-center w-full py-8 px-4 sm:px-6 ${
        leaving ? "pointer-events-none" : ""
      }`}
      initial={false}
      onAnimationComplete={() => {
        if (leaving) {
          navigate({ to: "/" });
        }
      }}
      transition={{ duration: 0.4, ease: "easeInOut" }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <OnboardingStepper
          steps={steps}
          currentStepIndex={stepIndex}
          completedStepIndices={completedSteps}
          onSelectStep={goToStep}
          onSkip={handleSkip}
          canSkip={stepIndex > 0 && stepIndex < steps.length - 1}
        />

        <MotionConfig transition={{ duration: 0.35, type: "spring", bounce: 0 }}>
          <motion.div
            animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}
            className="overflow-hidden"
          >
            <div ref={ref} className="px-1">
              <AnimatePresence custom={direction} initial={false} mode="popLayout">
                <motion.div
                  animate="active"
                  custom={direction}
                  exit="exit"
                  initial="initial"
                  key={stepIndex}
                  variants={variants}
                >
                  {/* Step 1: Willkommen */}
                  {currentStepId === "welcome" && (
                    <WelcomeStep onContinue={handleNext} />
                  )}

                  {/* Step 2: Darstellung */}
                  {currentStepId === "theme" && (
                    <ThemeStepWrapper
                      theme={theme}
                      onSelectTheme={setTheme}
                      accentColor={accentColor}
                      onSelectAccent={setAccentColor}
                      onContinue={handleNext}
                      onBack={handleBack}
                    />
                  )}

                  {/* Step 3: Firma anlegen/wählen */}
                  {currentStepId === "company" && (
                    <CompanyStep
                      selectedCompanyId={companyId}
                      onSelectCompany={setCompanyId}
                      onContinue={handleNext}
                      onBack={handleBack}
                    />
                  )}

                  {/* Step 4: Ersten Agent erstellen */}
                  {currentStepId === "agent" && (
                    <AgentWizardStep
                      onAgentCreated={(created) => setAgent(created)}
                      onContinue={handleNext}
                      onBack={handleBack}
                    />
                  )}

                  {/* Step 5: Tools & Store-Empfehlungen */}
                  {currentStepId === "tools" && (
                    <StoreRecommendationsStep
                      selectedTools={selectedTools}
                      onToggleTool={handleToggleTool}
                      onContinue={handleNext}
                      onBack={handleBack}
                    />
                  )}

                  {/*
                   * Step: Maschine (A26) — nur mit Flag `connect.t3.cuaMachines`.
                   * Der Schritt ist optional: er lässt sich überspringen, damit das
                   * Onboarding nie an einer fehlenden Maschine hängen bleibt.
                   */}
                  {currentStepId === MACHINE_STEP_ID && (
                    <MachineOnboardingStep
                      onBack={handleBack}
                      onContinue={handleNext}
                    />
                  )}

                  {/* Letzter Step: Fertig */}
                  {isCompleteStep && (
                    <CompleteStep
                      theme={theme}
                      companyName={currentCompanyName}
                      agentName={agent.name}
                      agentRole={agent.role}
                      toolsCount={selectedTools.length}
                      isSaving={completeMutation.isPending}
                      onComplete={handleCompleteAll}
                      onBack={handleBack}
                    />
                  )}
                </motion.div>
              </AnimatePresence>

              {completeMutation.error ? (
                <p className="mt-4 text-center text-xs text-destructive" role="alert">
                  {completeMutation.error.message}
                </p>
              ) : null}
            </div>
          </motion.div>
        </MotionConfig>
      </div>
    </motion.div>
  );
}

export default RouteComponent;
