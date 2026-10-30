/**
 * Schritt 1: Willkommen + Name / Profilbild (A25 / Wave 3)
 */

import * as React from "react";
import { Sparkles, User, ArrowRight, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";
import type { OnboardingData } from "../types";

export interface Step1WelcomeProps {
  data: OnboardingData;
  onUpdateData: (patch: Partial<OnboardingData>) => void;
  onContinue: () => void;
  isSaving?: boolean;
}

const DEFAULT_AVATARS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&h=128&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=128&h=128&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&h=128&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&h=128&fit=crop&crop=faces",
];

export function Step1Welcome({
  data,
  onUpdateData,
  onContinue,
  isSaving = false,
}: Step1WelcomeProps) {
  const [name, setName] = React.useState(data.fullName || "");
  const [avatar, setAvatar] = React.useState(data.avatarUrl || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateData({
      fullName: name.trim() || undefined,
      avatarUrl: avatar.trim() || undefined,
    });
    onContinue();
  };

  const getInitials = (n: string) => {
    const parts = n.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (n[0] || "U").toUpperCase();
  };
  const isDesignV2 = getFlag("designV2");

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2 text-center select-none">
      {/* Brand Icon Header */}
      <div className="relative mb-6">
        <div
          className={`size-20 flex items-center justify-center shadow-lg transition-transform duration-300 hover:scale-105 ${
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)]/30 bg-[var(--p-accent)]/15 text-[var(--p-accent)] shadow-[0_0_30px_rgba(56,189,248,0.2)]"
              : "rounded-3xl bg-gradient-to-tr from-primary/30 to-primary/10 border border-primary/20"
          }`}
        >
          <Sparkles className={`size-10 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
        </div>
      </div>

      <h1
        className={`text-3xl sm:text-4xl font-bold tracking-tight ${
          isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
        }`}
      >
        Willkommen bei Connect
      </h1>
      <p
        className={`text-sm sm:text-base mt-2 max-w-md leading-relaxed ${
          isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground"
        }`}
      >
        Richte in wenigen Schritten deinen persönlichen AI-Coworker-Workspace ein. Wie dürfen deine Kollegen dich nennen?
      </p>

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="w-full mt-8 max-w-md text-left space-y-6">
        {/* Avatar Selection & Preview */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="relative group">
            <div
              className={`size-20 rounded-full overflow-hidden flex items-center justify-center shadow-sm ${
                isDesignV2
                  ? "border-2 border-[var(--p-accent)]/40 bg-[var(--p-surface-2)]"
                  : "border-2 border-primary/40 bg-muted"
              }`}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt="Avatar"
                  className="size-full object-cover"
                  onError={() => setAvatar("")}
                />
              ) : (
                <span
                  className={`text-xl font-bold ${
                    isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
                  }`}
                >
                  {getInitials(name)}
                </span>
              )}
            </div>
            <div
              className={`absolute -bottom-1 -right-1 size-7 rounded-full flex items-center justify-center shadow-md border-2 ${
                isDesignV2
                  ? "bg-[var(--p-accent)] text-[var(--p-text-on-accent)] border-[var(--p-surface-1)]"
                  : "bg-primary text-primary-foreground border-background"
              }`}
            >
              <Camera className="size-3.5" />
            </div>
          </div>

          {/* Quick Avatar Suggestions */}
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs mr-1 ${
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
              }`}
            >
              Vorschläge:
            </span>
            {DEFAULT_AVATARS.map((url, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setAvatar(url)}
                className={`size-7 rounded-full overflow-hidden border transition-all ${
                  avatar === url
                    ? isDesignV2
                      ? "ring-2 ring-[var(--p-accent)] border-[var(--p-accent)] scale-110"
                      : "ring-2 ring-primary border-primary scale-110"
                    : isDesignV2
                      ? "border-[var(--p-border)] opacity-60 hover:opacity-100"
                      : "border-border/80 hover:opacity-80 opacity-60"
                }`}
              >
                <img src={url} alt={`Avatar ${idx + 1}`} className="size-full object-cover" />
              </button>
            ))}
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar("")}
                className={`text-xs underline ml-1 ${
                  isDesignV2
                    ? "text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Initialen
              </button>
            )}
          </div>
        </div>

        {/* Name Input */}
        <div className="space-y-2">
          <Label
            htmlFor="user-name"
            className={`text-xs font-semibold ${
              isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
            }`}
          >
            Dein vollständiger Name
          </Label>
          <div className="relative">
            <User
              className={`absolute left-3 top-2.5 size-4 ${
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
              }`}
            />
            <Input
              id="user-name"
              type="text"
              placeholder="z. B. Stefan Kunc"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`pl-9 h-10 text-sm ${
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)]"
                  : "bg-background/60"
              }`}
              autoFocus
            />
          </div>
          <p
            className={`text-[11px] ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            Dieser Name wird in Unterhaltungen mit deinen Bots und in Teamräumen angezeigt.
          </p>
        </div>

        {/* Continue Button */}
        <div className="pt-2">
          {isDesignV2 ? (
            <DesignButton
              type="submit"
              variant="primary"
              size="lg"
              loading={isSaving}
              rightIcon={<ArrowRight className="size-4" />}
              className="w-full"
            >
              Weiter zur Darstellung
            </DesignButton>
          ) : (
            <Button
              type="submit"
              disabled={isSaving}
              className="w-full gap-2 shadow-sm text-sm font-medium h-10"
            >
              Weiter zur Darstellung
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
