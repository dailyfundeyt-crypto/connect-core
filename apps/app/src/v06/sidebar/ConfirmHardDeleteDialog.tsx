import { IconAlertTriangle, IconLoader2, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

export interface ConfirmHardDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botId: string;
  botName: string;
  onConfirm: (botId: string, confirmName: string) => Promise<void>;
  isDeleting?: boolean;
}

/**
 * ConfirmHardDeleteDialog (A01 - v06, optimiert durch A34)
 *
 * Bestaetigungsdialog fuer unwiderrufliches Loeschen eines Bots.
 * - Zeigt Hinweis: „Dieser Vorgang ist unwiderruflich, vorher wird ein JSON-Export erstellt.“
 * - Eingabefeld muss exakt den Bot-Namen enthalten, erst dann ist der Loesch-Button aktiv.
 * - v06 Design-System: Obsidian-Tokens, Hairline-Borders und Dark/Light-Konsistenz unter FLAGS_V06.designV2.
 * - Universell robust gerendert (Inline Modal Overlay, um Portal-Abreißen in isolierten Testumgebungen zu verhindern).
 */
export function ConfirmHardDeleteDialog({
  open,
  onOpenChange,
  botId,
  botName,
  onConfirm,
  isDeleting = false,
}: ConfirmHardDeleteDialogProps) {
  const [confirmInput, setConfirmInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isDesignV2 = getFlag("designV2");

  // Reset input when dialog opens/closes or bot changes
  useEffect(() => {
    if (open) {
      setConfirmInput("");
      setErrorMsg(null);
    }
  }, [open, botId]);

  // ESC Key listener
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isDeleting, onOpenChange]);

  if (!open) return null;

  const isMatch = confirmInput.trim() === botName;

  const handleConfirm = async () => {
    if (!isMatch || isDeleting) return;
    try {
      setErrorMsg(null);
      await onConfirm(botId, confirmInput.trim());
      onOpenChange(false);
    } catch (err: any) {
      setErrorMsg(err?.message || "Fehler beim endgültigen Löschen.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hard-delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onOpenChange(false);
        }
      }}
    >
      <div
        className={cn(
          "w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all duration-150",
          isDesignV2
            ? "bg-[var(--p-surface-2)] text-[var(--p-text-1)] border border-[var(--p-border-strong)] shadow-[var(--p-shadow-lg)]"
            : "bg-card text-card-foreground border border-sidebar-border",
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <IconAlertTriangle
              className={cn(
                "size-5 shrink-0",
                isDesignV2 ? "text-[var(--p-danger)]" : "text-destructive",
              )}
            />
            <h2
              id="hard-delete-dialog-title"
              className={cn(
                "text-base font-semibold leading-none tracking-tight",
                isDesignV2 ? "text-[var(--p-danger)]" : "text-destructive",
              )}
            >
              Bot endgültig löschen
            </h2>
          </div>
          <p
            className={cn(
              "text-xs leading-relaxed",
              isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
            )}
          >
            Dieser Vorgang ist{" "}
            <strong
              className={cn(
                "font-semibold",
                isDesignV2 ? "text-[var(--p-danger)]" : "text-destructive",
              )}
            >
              unwiderruflich, vorher wird ein JSON-Export erstellt
            </strong>
            .
          </p>
        </div>

        <div className="py-4 flex flex-col gap-3">
          <p
            className={cn(
              "text-xs leading-relaxed",
              isDesignV2 ? "text-[var(--p-text-2)]" : "text-foreground/80",
            )}
          >
            Um den Bot{" "}
            <span
              className={cn(
                "font-mono font-semibold px-1.5 py-0.5 rounded",
                isDesignV2
                  ? "bg-[var(--p-surface-3)] text-[var(--p-text-1)] border border-[var(--p-border-subtle)]"
                  : "bg-muted/60 text-white",
              )}
            >
              {botName}
            </span>{" "}
            dauerhaft aus der Datenbank und allen Verbindungen zu löschen, gib bitte zur Bestätigung den exakten Bot-Namen ein:
          </p>

          <input
            autoFocus
            data-testid="hard-delete-confirm-input"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            onInput={(e) => setConfirmInput((e.target as HTMLInputElement).value)}
            placeholder={botName}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isMatch) {
                void handleConfirm();
              }
            }}
            className={cn(
              "h-9 w-full min-w-0 rounded-xl px-2.5 py-1 text-xs font-mono transition-all duration-150 outline-none",
              isDesignV2
                ? "bg-[var(--p-surface-1)] border border-[var(--p-border)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-dim)] focus-visible:border-[var(--p-accent)] focus-visible:ring-1 focus-visible:ring-[var(--p-accent)]"
                : "border border-input bg-transparent placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring dark:border-white/10 dark:bg-white/[0.04] dark:text-[#ededef]",
            )}
            disabled={isDeleting}
          />

          {errorMsg ? (
            <p
              className={cn(
                "text-xs font-medium",
                isDesignV2 ? "text-[var(--p-danger)]" : "text-destructive",
              )}
            >
              {errorMsg}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "text-xs",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "rounded-xl",
            )}
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            size="sm"
            data-testid="hard-delete-submit-button"
            className={cn(
              "text-xs gap-1.5 transition-all",
              isDesignV2
                ? "rounded-[var(--p-radius-md)] bg-[var(--p-danger)] hover:bg-[var(--p-danger-hover)] text-white font-medium shadow-[var(--p-shadow-sm)]"
                : "rounded-xl",
            )}
            onClick={handleConfirm}
            disabled={!isMatch || isDeleting}
          >
            {isDeleting ? (
              <>
                <IconLoader2 className="size-3.5 animate-spin" />
                Lösche…
              </>
            ) : (
              <>
                <IconTrash className="size-3.5" />
                Endgültig löschen
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmHardDeleteDialog;
