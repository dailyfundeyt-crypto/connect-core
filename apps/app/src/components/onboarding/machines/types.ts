/**
 * Typen für den Maschinen-Onboarding-Schritt.
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 */

export type OnboardingMachinePhase =
  | "checking"
  | "prompt"
  | "installing"
  | "ready"
  | "error";

export interface MachineOnboardingStepProps {
  onContinue?: () => void;
  onBack?: () => void;
  mock?: boolean;
  /** Optionale Vorauswahl für Tests und Initialzustände */
  initialPhase?: OnboardingMachinePhase;
  /** Erzwingt das Vorliegen eines bestehenden Consents (z. B. Admin Stefan) */
  hasExistingConsent?: boolean;
}
