/**
 * Typdefinitionen fuer Onboarding v06 (A25 / Wave 3)
 */

import type { ThemePreference } from "@/contracts/v06/theme";

export type OnboardingStepId =
  | "welcome"
  | "theme"
  | "company"
  | "tools"
  | "bot"
  | "qr"
  | "complete";

export interface OnboardingStepItem {
  id: OnboardingStepId;
  title: string;
  shortTitle: string;
  description: string;
  isOptional?: boolean;
}

export const ONBOARDING_STEPS_V06: OnboardingStepItem[] = [
  {
    id: "welcome",
    title: "Willkommen",
    shortTitle: "Profil",
    description: "Name & Profil konfigurieren",
  },
  {
    id: "theme",
    title: "Darstellung",
    shortTitle: "Theme",
    description: "Dark-Mode & Farbschema",
  },
  {
    id: "company",
    title: "Unternehmen",
    shortTitle: "Firma",
    description: "Firma anlegen oder wählen",
  },
  {
    id: "tools",
    title: "Tools aktivieren",
    shortTitle: "Tools",
    description: "Fähigkeiten & Module wählen",
  },
  {
    id: "bot",
    title: "Erster Bot",
    shortTitle: "Bot",
    description: "AI-Coworker aus Vorlage oder individuell",
  },
  {
    id: "qr",
    title: "Handy verbinden",
    shortTitle: "Mobile",
    description: "Optional Smartphone via QR koppeln",
    isOptional: true,
  },
  {
    id: "complete",
    title: "Fertig",
    shortTitle: "Start",
    description: "Direkt in Messages starten",
  },
];

export interface OnboardingData {
  fullName?: string;
  avatarUrl?: string;
  themePreference?: ThemePreference;
  companyId?: string;
  companyName?: string;
  tools?: string[];
  botId?: string;
  botName?: string;
  botRole?: string;
  botEngine?: string;
  phoneConnected?: boolean;
  [key: string]: unknown;
}

export interface OnboardingState {
  userId: string;
  step: OnboardingStepId;
  stepIndex: number;
  completedSteps: OnboardingStepId[];
  isCompleted: boolean;
  completedAt: string | null;
  data: OnboardingData;
  updatedAt: string;
}

export interface OnboardingPatchPayload {
  step?: OnboardingStepId;
  stepIndex?: number;
  completedSteps?: OnboardingStepId[];
  isCompleted?: boolean;
  data?: Partial<OnboardingData>;
  reset?: boolean;
}
