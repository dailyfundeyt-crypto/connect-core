import type { SidebarSectionSlot } from "@/contracts/sidebar";
import type { ChannelSummary } from "@/lib/channels/queries";
import type { AgentProfile } from "@/lib/agents/queries";

export interface SidebarV2Props {
  channels?: readonly ChannelSummary[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export interface AppAccountUI {
  id: string;
  userId: string;
  provider: string;
  app: string;
  accountName: string;
  label: string;
  email?: string;
  avatarUrl?: string;
  isActive: boolean;
  dataDir?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SidebarLayoutState {
  slots: SidebarSectionSlot[];
  collapsedFolders: string[];
  toolsEnabled: Record<string, boolean>;
}
