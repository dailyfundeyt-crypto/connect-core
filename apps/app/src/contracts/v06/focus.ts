/** Contract v06 – Änderungen nur durch A00/Integrator */

export type FocusCardId = "plan" | "datenbank" | "aufgaben" | "emails";

export const FOCUS_ORDER_V2: FocusCardId[] = [
  "plan",
  "datenbank",
  "aufgaben",
  "emails",
];

export interface FocusTarget {
  cardId: FocusCardId;
  opens: "grokbot" | "database" | "docs" | "email";
  url?: string;
}
