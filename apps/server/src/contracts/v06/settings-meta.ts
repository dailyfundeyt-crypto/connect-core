/** Contract v06 – Änderungen nur durch A00/Integrator */

export type SettingsGroup =
  | "konto"
  | "firma"
  | "verbindungen"
  | "agenten"
  | "darstellung"
  | "system";

export type SettingsSectionStatus = "keep" | "merge" | "hide";

export interface SettingsSectionMeta {
  id: string;
  label: string;
  group: SettingsGroup;
  status: SettingsSectionStatus;
  usedBy: string[];
}
