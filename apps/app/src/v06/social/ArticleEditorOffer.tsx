/**
 * Connect-Sozial: ArticleEditorOffer (v06 / A24)
 *
 * Block „Bot anbieten (verkaufen/vermieten)“ für den Artikel-Editor.
 * Enthält Konfigurations-Controls im Editor-Modus und die Angebots-Karte
 * mit Hinweis auf deaktivierte Zahlungsabwicklung im Anzeige-Modus.
 */

import React from "react";
import {
  IconRobot,
  IconShoppingBag,
  IconAlertCircle,
  IconLock,
  IconTag,
  IconClock,
  IconCheck,
  IconMessageCircle,
} from "@tabler/icons-react";
import type { BotOffer } from "./types";
import { getFlag } from "@/contracts/v06/flags";

export interface BotOption {
  id: string;
  name: string;
  description?: string;
}

export interface ArticleEditorOfferFormProps {
  enabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  offer: BotOffer | null;
  onChangeOffer: (offer: BotOffer | null) => void;
  availableBots: BotOption[];
  className?: string;
}

export interface ArticleOfferDisplayCardProps {
  offer: BotOffer;
  botName?: string;
  onContactOwner?: (botId: string, offer: BotOffer) => void;
  className?: string;
}

/**
 * Formular-Block zum Einhängen in den Artikel-Editor.
 */
export function ArticleEditorOfferForm({
  enabled,
  onToggleEnabled,
  offer,
  onChangeOffer,
  availableBots,
  className = "",
}: ArticleEditorOfferFormProps) {
  const currentBotId = offer?.botId || availableBots[0]?.id || "";
  const currentMode = offer?.mode || "rent";
  const currentPriceEur = offer ? (offer.priceCents / 100).toFixed(2) : "49.00";
  const currentPeriod = offer?.period || "month";

  const handleToggle = (active: boolean) => {
    onToggleEnabled(active);
    if (active) {
      onChangeOffer({
        botId: currentBotId,
        mode: currentMode,
        priceCents: Math.round(parseFloat(currentPriceEur || "0") * 100),
        currency: "EUR",
        period: currentMode === "rent" ? currentPeriod : undefined,
      });
    } else {
      onChangeOffer(null);
    }
  };

  const updateField = (changes: Partial<BotOffer>) => {
    if (!offer) return;
    const updated: BotOffer = {
      ...offer,
      ...changes,
    };
    if (updated.mode === "sale") {
      delete updated.period;
    } else if (!updated.period) {
      updated.period = "month";
    }
    onChangeOffer(updated);
  };

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#0c0e1a] p-4 text-white shadow-md ${className}`}
      data-testid="article-editor-offer-form"
    >
      {/* Header with Switch */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
            <IconShoppingBag className="size-4" />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-white">Bot-Angebot anhängen</h4>
            <p className="text-[11px] text-white/50">
              Biete einen deiner Firmen-Bots direkt in diesem Artikel zum Kauf oder zur Miete an.
            </p>
          </div>
        </div>

        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="peer sr-only"
            data-testid="offer-toggle-checkbox"
          />
          <div className="peer h-6 w-11 rounded-full bg-white/10 after:absolute after:top-[2px] after:left-[2px] after:size-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-500 peer-checked:after:translate-x-full peer-focus:outline-none" />
        </label>
      </div>

      {/* Offer Form Controls (shown when enabled) */}
      {enabled && offer && (
        <div className="mt-4 space-y-4 pt-1" data-testid="offer-form-fields">
          {/* Bot Selection */}
          <div>
            <label className="text-[12px] font-medium text-white/60">Bot auswählen</label>
            <select
              value={offer.botId}
              onChange={(e) => updateField({ botId: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/15 bg-[#121424] px-3 py-2 text-[13px] text-white outline-none focus:border-indigo-400"
              data-testid="offer-bot-select"
            >
              {availableBots.map((b) => (
                <option key={b.id} value={b.id}>
                  🤖 {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode & Pricing Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Mode: Sale vs Rent */}
            <div>
              <label className="text-[12px] font-medium text-white/60">Angebotsmodell</label>
              <div className="mt-1 flex rounded-xl border border-white/15 bg-white/5 p-0.5">
                <button
                  type="button"
                  onClick={() => updateField({ mode: "rent" })}
                  className={`flex-1 rounded-lg py-1.5 text-center text-[12px] font-semibold transition-all ${
                    offer.mode === "rent"
                      ? "bg-indigo-500 text-white shadow-sm"
                      : "text-white/60 hover:text-white"
                  }`}
                  data-testid="offer-mode-rent"
                >
                  Vermieten
                </button>
                <button
                  type="button"
                  onClick={() => updateField({ mode: "sale" })}
                  className={`flex-1 rounded-lg py-1.5 text-center text-[12px] font-semibold transition-all ${
                    offer.mode === "sale"
                      ? "bg-indigo-500 text-white shadow-sm"
                      : "text-white/60 hover:text-white"
                  }`}
                  data-testid="offer-mode-sale"
                >
                  Verkaufen
                </button>
              </div>
            </div>

            {/* Price in EUR */}
            <div>
              <label className="text-[12px] font-medium text-white/60">
                Preis in Euro ({offer.currency})
              </label>
              <div className="relative mt-1">
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={(offer.priceCents / 100).toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    updateField({ priceCents: Math.max(0, Math.round(val * 100)) });
                  }}
                  className="w-full rounded-xl border border-white/15 bg-white/5 pl-3 pr-8 py-2 text-[13px] text-white outline-none focus:border-indigo-400"
                  data-testid="offer-price-input"
                />
                <span className="absolute right-3 top-2 text-[13px] font-bold text-white/40">€</span>
              </div>
            </div>
          </div>

          {/* Period Selection (if Rent) */}
          {offer.mode === "rent" && (
            <div>
              <label className="text-[12px] font-medium text-white/60">Abrechnungszeitraum</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => updateField({ period: "month" })}
                  className={`rounded-xl px-4 py-1.5 text-[12px] font-medium border transition-colors ${
                    offer.period === "month"
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-300"
                      : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  Pro Monat (Monatlich)
                </button>
                <button
                  type="button"
                  onClick={() => updateField({ period: "day" })}
                  className={`rounded-xl px-4 py-1.5 text-[12px] font-medium border transition-colors ${
                    offer.period === "day"
                      ? "border-indigo-400 bg-indigo-500/20 text-indigo-300"
                      : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  Pro Tag (Täglich)
                </button>
              </div>
            </div>
          )}

          {/* Live Preview Display */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider block mb-2">
              Vorschau im fertigen Artikel:
            </span>
            <ArticleOfferDisplayCard
              offer={offer}
              botName={availableBots.find((b) => b.id === offer.botId)?.name}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Anzeige-Karte im fertigen Artikel (Zahlung deaktiviert mit Hinweis).
 */
export function ArticleOfferDisplayCard({
  offer,
  botName = "Autonomer Bot-Agent",
  onContactOwner,
  className = "",
}: ArticleOfferDisplayCardProps) {
  const [inquirySent, setInquirySent] = React.useState(false);

  const formattedPrice = (offer.priceCents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const periodLabel =
    offer.mode === "rent"
      ? offer.period === "day"
        ? " / Tag"
        : " / Monat"
      : " einmalig";

  const handleContact = () => {
    if (onContactOwner) {
      onContactOwner(offer.botId, offer);
    } else if (typeof window !== "undefined") {
      const inquiryText = `Hallo! Ich interessiere mich für das Bot-Angebot „${botName}“ (${offer.mode === "rent" ? "Miete" : "Kauf"} für ${formattedPrice} €${periodLabel}). Bitte sende mir weitere Informationen.`;
      if (navigator.clipboard) {
        void navigator.clipboard.writeText(inquiryText);
      }
      setInquirySent(true);
      setTimeout(() => setInquirySent(false), 3000);
      window.location.hash = `channel-inquiry-${encodeURIComponent(offer.botId)}`;
    }
  };

  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <div
        className={`rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-5 text-[var(--p-text-1)] shadow-md ${className}`}
        data-testid="article-offer-display-card"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Left: Bot Info */}
          <div className="flex items-start gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[var(--p-radius-md)] bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 text-[var(--p-accent)]">
              <IconRobot className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[15px] font-bold text-[var(--p-text-1)]">{botName}</h4>
                <span className="rounded-full bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--p-accent)]">
                  {offer.mode === "rent" ? "Zur Miete" : "Zum Kauf"}
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--p-text-3)]">
                Bot-ID: <code className="font-mono text-[var(--p-accent)]">{offer.botId}</code>
              </p>
            </div>
          </div>

          {/* Right: Price & CTA (Deactivated with Active Contact Option) */}
          <div className="flex flex-col sm:items-end gap-1.5">
            <div className="text-[18px] font-black text-[var(--p-text-1)]">
              {formattedPrice} €
              <span className="text-[12px] font-normal text-[var(--p-text-3)]">{periodLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Deactivated Action Button */}
              <button
                type="button"
                disabled
                className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[var(--p-surface-3)] px-3.5 py-2 text-[12px] font-bold text-[var(--p-text-3)] cursor-not-allowed border border-[var(--p-border)]"
                data-testid="offer-disabled-action-button"
                title="Direktzahlung in Version 1 deaktiviert"
              >
                <IconLock className="size-3.5" />
                <span>{offer.mode === "rent" ? "Mieten" : "Kaufen"}</span>
              </button>

              {/* Active Contact / Inquiry Button */}
              <button
                type="button"
                onClick={handleContact}
                className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[var(--p-accent)] hover:bg-[var(--p-accent)]/90 px-5 py-2 text-[12px] font-bold text-zinc-950 shadow-md transition-all active:scale-95"
                data-testid="offer-contact-button"
                title="Anbieter direkt kontaktieren"
              >
                <IconMessageCircle className="size-3.5" />
                <span>{inquirySent ? "Anfrage kopiert ✓" : "Anfrage senden"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Prominent Payment Deactivated Notice Box */}
        <div
          className="mt-4 flex items-start gap-2.5 rounded-[var(--p-radius-md)] border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200"
          data-testid="offer-deactivated-notice"
        >
          <IconAlertCircle className="size-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-bold text-amber-300">Zahlung deaktiviert (v1 Preview):</span>{" "}
            Direktzahlungen sind aktuell inaktiv. Nutze <strong>„Anfrage senden“</strong>, um mit
            dem Anbieter über Connect Messages/Channels direkt in Kontakt zu treten und Konditionen abzustimmen.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-[#101226] to-[#0c0d1b] p-5 shadow-xl ${className}`}
      data-testid="article-offer-display-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Bot Info */}
        <div className="flex items-start gap-3.5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
            <IconRobot className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-[15px] font-bold text-white">{botName}</h4>
              <span className="rounded-full bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
                {offer.mode === "rent" ? "Zur Miete" : "Zum Kauf"}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-white/60">
              Bot-ID: <code className="font-mono text-indigo-300">{offer.botId}</code>
            </p>
          </div>
        </div>

        {/* Right: Price & CTA (Deactivated with Active Contact Option) */}
        <div className="flex flex-col sm:items-end gap-1.5">
          <div className="text-[18px] font-black text-white">
            {formattedPrice} €
            <span className="text-[12px] font-normal text-white/60">{periodLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Deactivated Action Button */}
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-bold text-white/40 cursor-not-allowed border border-white/10"
              data-testid="offer-disabled-action-button"
              title="Direktzahlung in Version 1 deaktiviert"
            >
              <IconLock className="size-3.5" />
              <span>{offer.mode === "rent" ? "Mieten" : "Kaufen"}</span>
            </button>

            {/* Active Contact / Inquiry Button */}
            <button
              type="button"
              onClick={handleContact}
              className="flex items-center gap-1.5 rounded-full bg-indigo-500 hover:bg-indigo-400 px-4 py-1.5 text-[12px] font-bold text-white shadow-md shadow-indigo-500/20 transition-all active:scale-95"
              data-testid="offer-contact-button"
              title="Anbieter direkt kontaktieren"
            >
              <IconMessageCircle className="size-3.5" />
              <span>{inquirySent ? "Anfrage kopiert ✓" : "Anfrage senden"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Prominent Payment Deactivated Notice Box */}
      <div
        className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-200"
        data-testid="offer-deactivated-notice"
      >
        <IconAlertCircle className="size-4 shrink-0 text-amber-400 mt-0.5" />
        <div>
          <span className="font-bold text-amber-300">Zahlung deaktiviert (v1 Preview):</span>{" "}
          Direktzahlungen sind aktuell inaktiv. Nutze <strong>„Anfrage senden“</strong>, um mit
          dem Anbieter über Connect Messages/Channels direkt in Kontakt zu treten und Konditionen abzustimmen.
        </div>
      </div>
    </div>
  );
}

export default ArticleEditorOfferForm;
