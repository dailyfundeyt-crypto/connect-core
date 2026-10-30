import { IconTrash, IconUserMinus } from "@tabler/icons-react";
import { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { getFlag } from "@/contracts/v06/flags";
import { ConfirmHardDeleteDialog } from "./ConfirmHardDeleteDialog";
import { BotLifecycleToast } from "./BotLifecycleToast";
import { useBotLifecycle } from "./useBotLifecycle";

export interface BotContextMenuProps {
  bot: {
    id: string;
    name: string;
  };
  companyId: string | null;
  children: React.ReactNode;
}

/**
 * BotContextMenu (A01 - v06)
 *
 * Kontextmenue fuer Bots in der Sidebar (Ordner & Bots ohne Ordner).
 *
 * Feature-Flag: `getFlag("botLifecycle")`
 * - Bei Flag aus: rendert die Kinder 1:1 unveraendert ohne Kontextmenue.
 * - Bei Flag an:
 *   1. „Aus Firma entfernen“ -> POST /api/v06/bots/:id/remove-from-company
 *   2. „Endgültig löschen“ -> Oeffnet ConfirmHardDeleteDialog mit Namensbestaetigung
 */
export function BotContextMenu({
  bot,
  companyId,
  children,
}: BotContextMenuProps) {
  const isLifecycleEnabled = getFlag("botLifecycle");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const {
    removeFromCompany,
    hardDelete,
    isDeleting,
    toast,
    dismissToast,
  } = useBotLifecycle();

  // Flag aus: 1:1 altes Verhalten, keine Kontextmenue-Ummantelung
  if (!isLifecycleEnabled) {
    return <>{children}</>;
  }

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!companyId) return;
    await removeFromCompany(bot.id, companyId, bot.name);
  };

  const handleHardDeleteConfirm = async (botId: string, confirmName: string) => {
    await hardDelete(botId, confirmName);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="w-full">
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52 rounded-xl p-1.5 shadow-xl bg-card border-sidebar-border">
          <ContextMenuItem
            className="gap-2 text-xs rounded-lg px-2.5 py-1.5 cursor-pointer text-foreground/80 hover:text-foreground"
            onClick={handleRemove}
            disabled={!companyId}
          >
            <IconUserMinus className="size-3.5 text-muted-foreground" />
            Aus Firma entfernen
          </ContextMenuItem>
          <ContextMenuItem
            className="gap-2 text-xs text-destructive rounded-lg px-2.5 py-1.5 cursor-pointer focus:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
          >
            <IconTrash className="size-3.5" />
            Endgültig löschen
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ConfirmHardDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        botId={bot.id}
        botName={bot.name}
        onConfirm={handleHardDeleteConfirm}
        isDeleting={isDeleting}
      />

      <BotLifecycleToast toast={toast} onDismiss={dismissToast} />
    </>
  );
}

export default BotContextMenu;
