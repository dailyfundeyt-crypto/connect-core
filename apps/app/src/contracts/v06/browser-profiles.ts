/** Contract v06 – Änderungen nur durch A00/Integrator */

export const MAX_PROFILES_PER_AGENT = 10;

export interface BrowserProfile {
  id: string;
  agentId: string;
  name: string;
  color: string;
  status: "active" | "ended";
  createdAt: string;
}

export interface ProfileTabGroup {
  id: string;
  profileId: string;
  name: string;
  parentId?: string;
  order: number;
}

export interface ProfileTab {
  id: string;
  profileId: string;
  groupId?: string;
  url: string;
  title: string;
  cdpTargetId?: string;
  order: number;
}
