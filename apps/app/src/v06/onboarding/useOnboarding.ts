/**
 * useOnboarding Hook (A25 / Wave 3)
 * Verwaltet Navigation, Zustand, Server-Sync und Abbruch/Fortsetzen.
 */

import * as React from "react";
import {
  ONBOARDING_STEPS_V06,
  type OnboardingData,
  type OnboardingPatchPayload,
  type OnboardingState,
  type OnboardingStepId,
} from "./types";

const SESSION_STORAGE_KEY = "connect.v06.onboarding.cache";

export interface UseOnboardingReturn {
  state: OnboardingState;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  currentStepIndex: number;
  currentStep: (typeof ONBOARDING_STEPS_V06)[number];
  canGoBack: boolean;
  canSkip: boolean;
  isLastStep: boolean;
  goToStep: (index: number) => void;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  skipStep: () => Promise<void>;
  updateData: (patch: Partial<OnboardingData>) => void;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

export function createInitialState(): OnboardingState {
  return {
    userId: "local-user",
    step: "welcome",
    stepIndex: 0,
    completedSteps: [],
    isCompleted: false,
    completedAt: null,
    data: {
      fullName: "",
      avatarUrl: "",
      themePreference: "dark",
      tools: ["browser_use", "brain_memory", "cli_bridge", "drive_backup"],
      botName: "Nexus",
      botRole: "General Workspace Copilot",
    },
    updatedAt: new Date().toISOString(),
  };
}

export function useOnboarding(): UseOnboardingReturn {
  const [state, setState] = React.useState<OnboardingState>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.stepIndex === "number") {
            return parsed;
          }
        }
      } catch {
        /* ignore sessionStorage error */
      }
    }
    return createInitialState();
  });

  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sync state to sessionStorage
  const cacheLocally = React.useCallback((s: OnboardingState) => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Fetch state on mount from /api/v06/onboarding/state
  React.useEffect(() => {
    let mounted = true;
    async function loadServerState() {
      try {
        const res = await fetch("/api/v06/onboarding/state");
        if (res.ok) {
          const serverState = (await res.json()) as OnboardingState;
          if (mounted && serverState && typeof serverState.stepIndex === "number") {
            setState((prev) => {
              const merged: OnboardingState = {
                ...serverState,
                data: {
                  ...prev.data,
                  ...serverState.data,
                },
              };
              cacheLocally(merged);
              return merged;
            });
          }
        }
      } catch (err: any) {
        console.warn("[Onboarding v2] Could not load state from /api/v06/onboarding/state:", err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadServerState();
    return () => {
      mounted = false;
    };
  }, [cacheLocally]);

  // Synchronize patch to backend
  const syncServer = React.useCallback(
    async (patch: OnboardingPatchPayload): Promise<OnboardingState | null> => {
      setIsSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/v06/onboarding/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated = (await res.json()) as OnboardingState;
          return updated;
        }
      } catch (err: any) {
        console.warn("[Onboarding v2] Sync to /api/v06/onboarding/state failed:", err);
      } finally {
        setIsSaving(false);
      }
      return null;
    },
    [],
  );

  const updateData = React.useCallback(
    (patch: Partial<OnboardingData>) => {
      setState((prev) => {
        const next: OnboardingState = {
          ...prev,
          data: {
            ...prev.data,
            ...patch,
          },
          updatedAt: new Date().toISOString(),
        };
        cacheLocally(next);
        void syncServer({ data: patch });
        return next;
      });
    },
    [cacheLocally, syncServer],
  );

  const goToStep = React.useCallback(
    (targetIndex: number) => {
      const boundedIndex = Math.max(0, Math.min(targetIndex, ONBOARDING_STEPS_V06.length - 1));
      const targetStep = ONBOARDING_STEPS_V06[boundedIndex].id;

      setState((prev) => {
        const next: OnboardingState = {
          ...prev,
          step: targetStep,
          stepIndex: boundedIndex,
          updatedAt: new Date().toISOString(),
        };
        cacheLocally(next);
        void syncServer({
          step: targetStep,
          stepIndex: boundedIndex,
        });
        return next;
      });
    },
    [cacheLocally, syncServer],
  );

  const nextStep = React.useCallback(async () => {
    const nextIdx = Math.min(state.stepIndex + 1, ONBOARDING_STEPS_V06.length - 1);
    const nextStepId = ONBOARDING_STEPS_V06[nextIdx].id;
    const currentStepId = ONBOARDING_STEPS_V06[state.stepIndex].id;

    const completed = [...new Set([...state.completedSteps, currentStepId])];

    const nextState: OnboardingState = {
      ...state,
      step: nextStepId,
      stepIndex: nextIdx,
      completedSteps: completed,
      updatedAt: new Date().toISOString(),
    };

    setState(nextState);
    cacheLocally(nextState);

    await syncServer({
      step: nextStepId,
      stepIndex: nextIdx,
      completedSteps: completed,
      data: state.data,
    });
  }, [state, cacheLocally, syncServer]);

  const prevStep = React.useCallback(() => {
    const prevIdx = Math.max(0, state.stepIndex - 1);
    const prevStepId = ONBOARDING_STEPS_V06[prevIdx].id;

    const nextState: OnboardingState = {
      ...state,
      step: prevStepId,
      stepIndex: prevIdx,
      updatedAt: new Date().toISOString(),
    };

    setState(nextState);
    cacheLocally(nextState);

    void syncServer({
      step: prevStepId,
      stepIndex: prevIdx,
    });
  }, [state, cacheLocally, syncServer]);

  const skipStep = React.useCallback(async () => {
    await nextStep();
  }, [nextStep]);

  const completeOnboarding = React.useCallback(async () => {
    const allStepIds = ONBOARDING_STEPS_V06.map((s) => s.id);
    const nowIso = new Date().toISOString();

    const finalState: OnboardingState = {
      ...state,
      step: "complete",
      stepIndex: ONBOARDING_STEPS_V06.length - 1,
      completedSteps: allStepIds,
      isCompleted: true,
      completedAt: nowIso,
      updatedAt: nowIso,
    };

    setState(finalState);
    cacheLocally(finalState);

    // Call server to persist completedAt
    await syncServer({
      step: "complete",
      stepIndex: ONBOARDING_STEPS_V06.length - 1,
      completedSteps: allStepIds,
      isCompleted: true,
      data: state.data,
    });

    // Also trigger old /api/me/onboarding if exists for compatibility
    try {
      await fetch("/api/me/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
    } catch {
      /* ignore */
    }
  }, [state, cacheLocally, syncServer]);

  const resetOnboarding = React.useCallback(async () => {
    const reset = createInitialState();
    setState(reset);
    cacheLocally(reset);
    await syncServer({ reset: true });
  }, [cacheLocally, syncServer]);

  const currentStep = ONBOARDING_STEPS_V06[state.stepIndex] || ONBOARDING_STEPS_V06[0];
  const canGoBack = state.stepIndex > 0;
  const canSkip = Boolean(currentStep.isOptional) && state.stepIndex < ONBOARDING_STEPS_V06.length - 1;
  const isLastStep = state.stepIndex === ONBOARDING_STEPS_V06.length - 1;

  return {
    state,
    isLoading,
    isSaving,
    error,
    currentStepIndex: state.stepIndex,
    currentStep,
    canGoBack,
    canSkip,
    isLastStep,
    goToStep,
    nextStep,
    prevStep,
    skipStep,
    updateData,
    completeOnboarding,
    resetOnboarding,
  };
}
