import { z } from "zod";

/**
 * Sidebar Section Slots for Sidebar V2 (Lane 1)
 * Ordered canonical slots:
 * 1. company-header
 * 2. apps
 * 3. bot-folders
 * 4. unfiled-bots
 * 5. tools
 * 6. profile-footer
 */
export const SidebarSectionSlotSchema = z.enum([
  "company-header",
  "apps",
  "bot-folders",
  "unfiled-bots",
  "tools",
  "profile-footer",
]);

export type SidebarSectionSlot = z.infer<typeof SidebarSectionSlotSchema>;

export const CANONICAL_SIDEBAR_SLOTS: readonly SidebarSectionSlot[] = [
  "company-header",
  "apps",
  "bot-folders",
  "unfiled-bots",
  "tools",
  "profile-footer",
] as const;

export const SidebarLayoutSchema = z.object({
  slots: z.array(SidebarSectionSlotSchema),
  collapsedFolders: z.array(z.string()).default([]),
  toolsEnabled: z.record(z.string(), z.boolean()).default({}),
});

export type SidebarLayout = z.infer<typeof SidebarLayoutSchema>;
