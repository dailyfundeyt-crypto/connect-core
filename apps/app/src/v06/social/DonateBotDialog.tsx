/**
 * Connect-Sozial: DonateBotDialog (v06 / A24)
 *
 * Dialog / Modal zur Spende von Bot-Rechenzeit und Tageskontingenten
 * an ein kollaboratives Forschungsprojekt.
 */

import React, { useState } from "react";
import {
  IconRobot,
  IconHeartHandshake,
  IconX,
  IconCalendar,
  IconCpu,
  IconLoader2,
  IconAlertCircle,
  IconCheck,
} from "@tabler/icons-react";
import { useProjectDonations } from "./useSocial";
import type { BotDonation } from "./types";
import { getFlag } from "@/contracts/v06/flags";

export interface DonateBotOption {
  id: string;
  name: string;
}

export interface DonateBotDialogProps {
  projectId: string;
  projectTitle: string;
  isOpen: boolean;
  onClose: () => void;
  availableBots?: DonateBotOption[];
  currentOwnerId?: string;
  onDonationSuccess?: (donation: BotDonation) => void;
}

export function DonateBotDialog({
  projectId,
  projectTitle,
  isOpen,
  onClose,
  availableBots = [
    { id: "researcher-bot", name: "Deep Research Agent" },
    { id: "coder-bot", name: "Fullstack Coder" },
    { id: "evaluator-bot", name: "Task Evaluator" },
  ],
  currentOwnerId = "kunc_gmbh",
  onDonationSuccess,
}: DonateBotDialogProps) {
  const [selectedBotId, setSelectedBotId] = useState<string>(availableBots[0]?.id || "");
  const [dailyQuota, setDailyQuota] = useState<number>(25);
  const [untilDate, setUntilDate] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const { donateBot, isDonating } = useProjectDonations(projectId);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedBotId) {
      setErrorMsg("Bitte wähle einen Bot aus.");
      return;
    }

    if (!dailyQuota || dailyQuota <= 0) {
      setErrorMsg("Das Tageskontingent muss mindestens 1 Task/Anfrage pro Tag betragen.");
      return;
    }

    try {
      const res = await donateBot({
        botId: selectedBotId,
        ownerId: currentOwnerId,
        dailyQuota: Number(dailyQuota),
        until: untilDate ? new Date(untilDate).toISOString() : undefined,
      });

      setIsSuccess(true);
      if (onDonationSuccess && res.donation) {
        onDonationSuccess(res.donation);
      }

      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Erstellen der Bot-Spende.");
    }
  };

  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
        onClick={onClose}
        data-testid="donate-bot-dialog-backdrop"
      >
        <div
          className="relative w-full max-w-md rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-6 shadow-2xl text-[var(--p-text-1)]"
          onClick={(e) => e.stopPropagation()}
          data-testid="donate-bot-dialog-content"
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)] transition-colors"
            data-testid="donate-dialog-close"
          >
            <IconX className="size-5" />
          </button>

          {/* Dialog Header */}
          <div className="flex items-center gap-3 border-b border-[var(--p-border)] pb-4">
            <div className="flex size-11 items-center justify-center rounded-[var(--p-radius-md)] bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 text-[var(--p-accent)]">
              <IconHeartHandshake className="size-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--p-text-1)]">Bot-Rechenzeit spenden</h3>
              <p className="text-[12px] text-[var(--p-text-3)] truncate max-w-[260px]">{projectTitle}</p>
            </div>
          </div>

          {isSuccess ? (
            <div className="py-8 text-center space-y-2 animate-in zoom-in-95 duration-200">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--p-success)]/20 text-[var(--p-success)] border border-[var(--p-success)]/40">
                <IconCheck className="size-6" />
              </div>
              <h4 className="text-base font-bold text-[var(--p-text-1)]">Spende erfolgreich registriert!</h4>
              <p className="text-[13px] text-[var(--p-text-2)]">
                Der Bot stellt dem Projekt ab sofort täglich {dailyQuota} Ausführungen bereit.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Info Notice */}
              <div className="rounded-[var(--p-radius-md)] border border-[var(--p-accent)]/20 bg-[var(--p-accent)]/10 p-3 text-[12px] text-[var(--p-text-1)] leading-relaxed">
                Spende deinem gewählten Forschungsprojekt tägliche Bot-Rechenzeit. Dein Bot bearbeitet
                automatisch offene Projektaufgaben im Rahmen des festgelegten Tageskontingents.
              </div>

              {/* Bot Selection */}
              <div>
                <label className="text-[12px] font-medium text-[var(--p-text-2)]">Wähle deinen Bot</label>
                <div className="mt-1 relative">
                  <select
                    value={selectedBotId}
                    onChange={(e) => setSelectedBotId(e.target.value)}
                    className="w-full min-h-[44px] rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] px-3.5 py-2.5 text-[13px] text-[var(--p-text-1)] outline-none focus:border-[var(--p-accent)]"
                    data-testid="donate-bot-select"
                  >
                    {availableBots.map((b) => (
                      <option key={b.id} value={b.id} className="bg-[#121424] text-white">
                        🤖 {b.name} ({b.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Daily Quota Input */}
              <div>
                <label className="text-[12px] font-medium text-[var(--p-text-2)]">
                  Tageskontingent (Aufgaben / Runs pro Tag)
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={dailyQuota}
                    onChange={(e) => setDailyQuota(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full min-h-[44px] rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] pl-3.5 pr-20 py-2.5 text-[14px] text-[var(--p-text-1)] outline-none focus:border-[var(--p-accent)]"
                    data-testid="donate-daily-quota-input"
                  />
                  <span className="absolute right-3.5 top-3 text-[12px] font-semibold text-[var(--p-text-3)]">
                    Runs/Tag
                  </span>
                </div>
              </div>

              {/* Expiry Date (Optional) */}
              <div>
                <label className="text-[12px] font-medium text-[var(--p-text-2)]">
                  Spende aktiv bis (optional)
                </label>
                <div className="relative mt-1">
                  <input
                    type="date"
                    value={untilDate}
                    onChange={(e) => setUntilDate(e.target.value)}
                    className="w-full min-h-[44px] rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] px-3.5 py-2 text-[13px] text-[var(--p-text-1)] outline-none focus:border-[var(--p-accent)]"
                    data-testid="donate-until-date-input"
                  />
                </div>
                <span className="mt-1 block text-[11px] text-[var(--p-text-3)]">
                  Leer lassen für unbefristete Bereitstellung.
                </span>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="flex items-center gap-2 rounded-[var(--p-radius-md)] bg-[var(--p-danger)]/10 border border-[var(--p-danger)]/30 p-2.5 text-[12px] text-rose-300">
                  <IconAlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--p-border)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--p-text-2)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)] transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isDonating}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[var(--p-accent)] px-5 py-2 text-[13px] font-bold text-zinc-950 shadow-md transition-all hover:bg-[var(--p-accent)]/90 disabled:opacity-50"
                  data-testid="donate-submit-button"
                >
                  {isDonating ? (
                    <>
                      <IconLoader2 className="size-4 animate-spin" />
                      <span>Wird registriert…</span>
                    </>
                  ) : (
                    <>
                      <IconHeartHandshake className="size-4" />
                      <span>Spende aktivieren</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="donate-bot-dialog-backdrop"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0f1e] p-6 shadow-2xl text-white"
        onClick={(e) => e.stopPropagation()}
        data-testid="donate-bot-dialog-content"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          data-testid="donate-dialog-close"
        >
          <IconX className="size-5" />
        </button>

        {/* Dialog Header */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400">
            <IconHeartHandshake className="size-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Bot-Rechenzeit spenden</h3>
            <p className="text-[12px] text-white/50 truncate max-w-[260px]">{projectTitle}</p>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-2 animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <IconCheck className="size-6" />
            </div>
            <h4 className="text-base font-bold text-white">Spende erfolgreich registriert!</h4>
            <p className="text-[13px] text-white/60">
              Der Bot stellt dem Projekt ab sofort täglich {dailyQuota} Ausführungen bereit.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Info Notice */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[12px] text-amber-200 leading-relaxed">
              Spende deinem gewählten Forschungsprojekt tägliche Bot-Rechenzeit. Dein Bot bearbeitet
              automatisch offene Projektaufgaben im Rahmen des festgelegten Tageskontingents.
            </div>

            {/* Bot Selection */}
            <div>
              <label className="text-[12px] font-medium text-white/70">Wähle deinen Bot</label>
              <div className="mt-1 relative">
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#121424] px-3.5 py-2.5 text-[13px] text-white outline-none focus:border-amber-400"
                  data-testid="donate-bot-select"
                >
                  {availableBots.map((b) => (
                    <option key={b.id} value={b.id}>
                      🤖 {b.name} ({b.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Daily Quota Input */}
            <div>
              <label className="text-[12px] font-medium text-white/70">
                Tageskontingent (Aufgaben / Runs pro Tag)
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={dailyQuota}
                  onChange={(e) => setDailyQuota(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full rounded-xl border border-white/15 bg-white/5 pl-3.5 pr-14 py-2.5 text-[14px] text-white outline-none focus:border-amber-400"
                  data-testid="donate-daily-quota-input"
                />
                <span className="absolute right-3.5 top-2.5 text-[12px] font-semibold text-white/40">
                  Runs/Tag
                </span>
              </div>
            </div>

            {/* Expiry Date (Optional) */}
            <div>
              <label className="text-[12px] font-medium text-white/70">
                Spende aktiv bis (optional)
              </label>
              <div className="relative mt-1">
                <input
                  type="date"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#121424] px-3.5 py-2 text-[13px] text-white outline-none focus:border-amber-400"
                  data-testid="donate-until-date-input"
                />
              </div>
              <span className="mt-1 block text-[11px] text-white/40">
                Leer lassen für unbefristete Bereitstellung.
              </span>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 text-[12px] text-rose-300">
                <IconAlertCircle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[13px] font-semibold text-white/60 hover:bg-white/10 transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={isDonating}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-[13px] font-bold text-white shadow-md shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400 transition-all disabled:opacity-50"
                data-testid="donate-submit-button"
              >
                {isDonating ? (
                  <>
                    <IconLoader2 className="size-4 animate-spin" />
                    <span>Wird registriert…</span>
                  </>
                ) : (
                  <>
                    <IconHeartHandshake className="size-4" />
                    <span>Spende aktivieren</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default DonateBotDialog;
