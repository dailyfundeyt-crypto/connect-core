/**
 * Connect-Sozial: Composer mit Bild-Upload-Vorschau & Autor-Wahl Firma/Bot (v06 / A24)
 */

import React, { useState, useRef } from "react";
import {
  IconBuilding,
  IconRobot,
  IconPhoto,
  IconSend,
  IconX,
  IconLoader2,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useSocialTimeline, useMediaUpload } from "./useSocial";
import type { SocialPost } from "./types";
import { getFlag } from "@/contracts/v06/flags";

export interface ComposerBot {
  id: string;
  name: string;
}

export interface ComposerProps {
  companyId?: string;
  availableBots?: ComposerBot[];
  onPostCreated?: (post: SocialPost) => void;
  className?: string;
  placeholder?: string;
}

export function Composer({
  companyId = "kunc_gmbh",
  availableBots = [
    { id: "researcher-bot", name: "Deep Research Agent" },
    { id: "coder-bot", name: "Fullstack Coder" },
    { id: "writer-bot", name: "Social Copywriter" },
  ],
  onPostCreated,
  className = "",
  placeholder = "Was gibt es Neues in deinem Unternehmen oder Projekt?",
}: ComposerProps) {
  const [authorType, setAuthorType] = useState<"company" | "bot">("company");
  const [selectedBotId, setSelectedBotId] = useState<string>(availableBots[0]?.id || "");
  const [text, setText] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createPost, isCreating } = useSocialTimeline();
  const { uploadFile, isUploading } = useMediaUpload();

  // Handle local image file selection & upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMsg(null);
    const newUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const record = await uploadFile({
          file,
          companyId,
          uploadedBy: authorType === "bot" ? selectedBotId : companyId,
        });
        if (record && record.url) {
          newUrls.push(record.url);
        }
      } catch (err: any) {
        console.error("Upload failed", err);
        setErrorMsg(err.message || `Upload von ${file.name} fehlgeschlagen.`);
      }
    }

    if (newUrls.length > 0) {
      setMediaUrls((prev) => [...prev, ...newUrls]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmed = text.trim();
    if (!trimmed && mediaUrls.length === 0) {
      setErrorMsg("Bitte gib einen Text ein oder wähle mindestens ein Bild aus.");
      return;
    }

    if (authorType === "bot" && !selectedBotId) {
      setErrorMsg("Bitte wähle einen Bot als Autor aus.");
      return;
    }

    try {
      const post = await createPost({
        authorCompanyId: companyId,
        authorBotId: authorType === "bot" ? selectedBotId : undefined,
        kind: "post",
        text: trimmed,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      });

      // Reset form
      setText("");
      setMediaUrls([]);
      setErrorMsg(null);

      if (onPostCreated) {
        onPostCreated(post);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Veröffentlichen des Beitrags.");
    }
  };

  const isSubmitting = isCreating || isUploading;
  const canSubmit = (text.trim().length > 0 || mediaUrls.length > 0) && !isSubmitting;
  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <form
        onSubmit={handleSubmit}
        className={`rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-4 shadow-sm backdrop-blur-md text-[var(--p-text-1)] ${className}`}
        data-testid="social-composer"
      >
        {/* Top Bar: Autor-Wahl (Firma vs. Bot) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--p-border)] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[var(--p-text-3)]">Posten als:</span>

            {/* Author Mode Switcher */}
            <div className="flex items-center rounded-[var(--p-radius-md)] bg-[var(--p-surface-3)] p-0.5 border border-[var(--p-border)]">
              <button
                type="button"
                onClick={() => setAuthorType("company")}
                className={`flex min-h-[36px] items-center gap-1.5 rounded-[var(--p-radius-sm)] px-3 py-1.5 text-[12px] font-semibold transition-all ${
                  authorType === "company"
                    ? "bg-[var(--p-accent)] text-zinc-950 shadow-sm"
                    : "text-[var(--p-text-2)] hover:text-[var(--p-text-1)]"
                }`}
                data-testid="composer-author-company-toggle"
              >
                <IconBuilding className="size-3.5" />
                <span>Firma ({companyId})</span>
              </button>

              <button
                type="button"
                onClick={() => setAuthorType("bot")}
                className={`flex min-h-[36px] items-center gap-1.5 rounded-[var(--p-radius-sm)] px-3 py-1.5 text-[12px] font-semibold transition-all ${
                  authorType === "bot"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-[var(--p-text-2)] hover:text-[var(--p-text-1)]"
                }`}
                data-testid="composer-author-bot-toggle"
              >
                <IconRobot className="size-3.5" />
                <span>Bot</span>
              </button>
            </div>

            {/* Bot Dropdown if Bot mode active */}
            {authorType === "bot" && (
              <select
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="min-h-[36px] rounded-[var(--p-radius-md)] border border-emerald-500/30 bg-[var(--p-surface-3)] px-3 py-1.5 text-[12px] font-medium text-emerald-300 outline-none focus:border-emerald-400"
                data-testid="composer-bot-select"
              >
                {availableBots.map((bot) => (
                  <option key={bot.id} value={bot.id} className="bg-[#121424] text-white">
                    🤖 {bot.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Info Pill */}
          <span className="text-[11px] text-[var(--p-text-3)]">Öffentlicher Connect Feed</span>
        </div>

        {/* Main Textarea */}
        <div className="mt-3">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] outline-none"
            data-testid="composer-textarea"
          />
        </div>

        {/* Bilder-Vorschau Grid */}
        {mediaUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="composer-media-preview">
            {mediaUrls.map((url, idx) => (
              <div
                key={url}
                className="relative group aspect-square rounded-[var(--p-radius-md)] overflow-hidden border border-[var(--p-border)] bg-black/40"
              >
                <img src={url} alt={`Vorschau ${idx + 1}`} className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeMedia(idx)}
                  className="absolute top-1 right-1 rounded-full bg-black/70 hover:bg-rose-500 p-1 text-white transition-colors"
                  title="Bild entfernen"
                  data-testid={`composer-remove-media-${idx}`}
                >
                  <IconX className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {errorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-[var(--p-radius-md)] bg-[var(--p-danger)]/10 border border-[var(--p-danger)]/30 p-2.5 text-[12px] text-rose-300">
            <IconAlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Bottom Action Bar */}
        <div className="mt-3 flex items-center justify-between border-t border-[var(--p-border)] pt-3">
          <div className="flex items-center gap-2">
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              multiple
              onChange={handleFileChange}
              className="hidden"
              data-testid="composer-file-input"
            />

            {/* Upload Button */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--p-radius-md)] bg-[var(--p-surface-3)] hover:bg-[var(--p-surface-1)] px-3.5 py-2 text-[12px] font-medium text-[var(--p-text-1)] transition-colors border border-[var(--p-border)] disabled:opacity-50"
              data-testid="composer-upload-button"
            >
              {isUploading ? (
                <IconLoader2 className="size-4 animate-spin text-[var(--p-accent)]" />
              ) : (
                <IconPhoto className="size-4 text-[var(--p-accent)]" />
              )}
              <span>{isUploading ? "Wird hochgeladen…" : "Bild anhängen"}</span>
            </button>
          </div>

          {/* Submit Post Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[var(--p-accent)] px-5 py-2 text-[13px] font-bold text-zinc-950 shadow-md transition-all hover:bg-[var(--p-accent)]/90 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            data-testid="composer-submit-button"
          >
            {isCreating ? (
              <>
                <IconLoader2 className="size-4 animate-spin" />
                <span>Posten…</span>
              </>
            ) : (
              <>
                <IconSend className="size-4" />
                <span>Veröffentlichen</span>
              </>
            )}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-2xl border border-white/10 bg-[#0d0e1b] p-4 shadow-xl backdrop-blur-md ${className}`}
      data-testid="social-composer"
    >
      {/* Top Bar: Autor-Wahl (Firma vs. Bot) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-white/50">Posten als:</span>

          {/* Author Mode Switcher */}
          <div className="flex items-center rounded-xl bg-white/5 p-0.5 border border-white/10">
            <button
              type="button"
              onClick={() => setAuthorType("company")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-all ${
                authorType === "company"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
              data-testid="composer-author-company-toggle"
            >
              <IconBuilding className="size-3.5" />
              <span>Firma ({companyId})</span>
            </button>

            <button
              type="button"
              onClick={() => setAuthorType("bot")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-all ${
                authorType === "bot"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-white/60 hover:text-white"
              }`}
              data-testid="composer-author-bot-toggle"
            >
              <IconRobot className="size-3.5" />
              <span>Bot</span>
            </button>
          </div>

          {/* Bot Dropdown if Bot mode active */}
          {authorType === "bot" && (
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 text-[12px] font-medium text-emerald-300 outline-none focus:border-emerald-400"
              data-testid="composer-bot-select"
            >
              {availableBots.map((bot) => (
                <option key={bot.id} value={bot.id} className="bg-[#121424] text-white">
                  🤖 {bot.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Info Pill */}
        <span className="text-[11px] text-white/40">Öffentlicher Connect Feed</span>
      </div>

      {/* Main Textarea */}
      <div className="mt-3">
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-white placeholder:text-white/30 outline-none"
          data-testid="composer-textarea"
        />
      </div>

      {/* Bilder-Vorschau Grid */}
      {mediaUrls.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="composer-media-preview">
          {mediaUrls.map((url, idx) => (
            <div
              key={url}
              className="relative group aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40"
            >
              <img src={url} alt={`Vorschau ${idx + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removeMedia(idx)}
                className="absolute top-1 right-1 rounded-full bg-black/70 hover:bg-rose-500 p-1 text-white transition-colors"
                title="Bild entfernen"
                data-testid={`composer-remove-media-${idx}`}
              >
                <IconX className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 text-[12px] text-rose-300">
          <IconAlertCircle className="size-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
        <div className="flex items-center gap-2">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            multiple
            onChange={handleFileChange}
            className="hidden"
            data-testid="composer-file-input"
          />

          {/* Upload Button */}
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white/80 transition-colors border border-white/10 disabled:opacity-50"
            data-testid="composer-upload-button"
          >
            {isUploading ? (
              <IconLoader2 className="size-4 animate-spin text-sky-400" />
            ) : (
              <IconPhoto className="size-4 text-sky-400" />
            )}
            <span>{isUploading ? "Wird hochgeladen…" : "Bild anhängen"}</span>
          </button>
        </div>

        {/* Submit Post Button */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-1.5 rounded-full bg-sky-500 px-5 py-2 text-[13px] font-bold text-white shadow-md shadow-sky-500/20 transition-all hover:bg-sky-400 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
          data-testid="composer-submit-button"
        >
          {isCreating ? (
            <>
              <IconLoader2 className="size-4 animate-spin" />
              <span>Posten…</span>
            </>
          ) : (
            <>
              <IconSend className="size-4" />
              <span>Veröffentlichen</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export default Composer;
