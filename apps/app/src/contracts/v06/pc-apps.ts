/** Contract v06 – Änderungen nur durch A00/Integrator */

export interface PcAppEntry {
  id: string;
  groupId: string;
  name: string;
  exePath: string;
  windowMatch: {
    titleRegex?: string;
    processName?: string;
  };
  iconPath?: string;
}
