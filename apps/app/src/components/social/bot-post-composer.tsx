import React, { useState, useRef } from "react";
import {
  IconPhoto,
  IconRobot,
  IconBuilding,
  IconUser,
  IconX,
  IconCheck,
  IconChevronDown,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { listCompanies } from "@/lib/companies/store";
import { cn } from "@/lib/utils";

export interface BotPostComposerProps {
  onPostCreated?: () => void;
  className?: string;
  defaultCompanyId?: string;
}

export type PostAuthorType = "user" | "bot" | "company";

export interface PostAuthorSelection {
  type: PostAuthorType;
  id: string;
  name: string;
  avatar?: string;
  badge?: string;
}

export function BotPostComposer({ onPostCreated, className, defaultCompanyId }: BotPostComposerProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaList, setMediaList] = useState<{ id: string; url: string; filename: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);

  // Author selection: User / Bot / Company
  const [selectedAuthor, setSelectedAuthor] = useState<PostAuthorSelection>({
    type: "user",
    id: "user_stefan",
    name: "Stefan Kunc",
    badge: "Nutzer",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load available bots
  const agentsQuery = useQuery(agentListQueryOptions());
  const agents = agentsQuery.data ?? [];

  // Load companies
  const companies = listCompanies();

  // Handle Image Upload to /api/social/media
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (mediaList.length + files.length > 4) {
      setError("Maximal 4 Bilder pro Post erlaubt.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 10 * 1024 * 1024) {
          setError(`Datei ${file.name} ist zu groß (> 10 MB).`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("uploadedBy", selectedAuthor.name);

        const res = await fetch("/api/social/media", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Upload fehlgeschlagen.");
        }

        const data = await res.json();
        setMediaList((prev) => [...prev, { id: data.id, url: data.url, filename: data.filename }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Hochladen der Bilder.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeMedia = (index: number) => {
    setMediaList((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Post
  const handlePostSubmit = async () => {
    if (!content.trim() && mediaList.length === 0) {
      setError("Schreib etwas oder füge ein Bild hinzu.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId: selectedAuthor.id,
          authorType: selectedAuthor.type,
          authorName: selectedAuthor.name,
          authorAvatar: selectedAuthor.avatar,
          companyId: defaultCompanyId,
          content: content.trim(),
          mediaUrls: mediaList.map((m) => m.url),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fehler beim Veröffentlichen.");
      }

      setContent("");
      setMediaList([]);
      onPostCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte nicht gepostet werden.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[#0d0f18]/80 p-4 backdrop-blur-md shadow-xl",
        className,
      )}
      data-testid="bot-post-composer"
    >
      {/* Author Selector Bar */}
      <div className="relative mb-3 flex items-center justify-between border-b border-white/5 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-white/50">Posten als:</span>
          <button
            type="button"
            onClick={() => setAuthorDropdownOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-[13px] font-semibold text-sky-200 transition-colors hover:bg-sky-500/20"
            data-testid="author-picker-toggle"
          >
            {selectedAuthor.type === "bot" && <IconRobot className="size-3.5 text-emerald-400" />}
            {selectedAuthor.type === "company" && <IconBuilding className="size-3.5 text-amber-400" />}
            {selectedAuthor.type === "user" && <IconUser className="size-3.5 text-sky-400" />}
            <span>{selectedAuthor.name}</span>
            <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] text-white/70">
              {selectedAuthor.badge || selectedAuthor.type}
            </span>
            <IconChevronDown className="size-3.5 opacity-60" />
          </button>
        </div>

        {/* Author Dropdown */}
        {authorDropdownOpen && (
          <div
            className="absolute left-0 top-10 z-50 mt-1 w-64 rounded-xl border border-white/15 bg-[#121422] p-2 shadow-2xl backdrop-blur-xl"
            data-testid="author-dropdown-menu"
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
              Nutzer
            </div>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-white/10",
                selectedAuthor.id === "user_stefan" && "bg-sky-500/15 text-sky-200",
              )}
              onClick={() => {
                setSelectedAuthor({ type: "user", id: "user_stefan", name: "Stefan Kunc", badge: "Nutzer" });
                setAuthorDropdownOpen(false);
              }}
            >
              <IconUser className="size-4 text-sky-400" />
              <span className="flex-1 font-medium">Stefan Kunc</span>
              {selectedAuthor.id === "user_stefan" && <IconCheck className="size-4 text-sky-400" />}
            </button>

            {/* Bots Section */}
            <div className="mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
              Bots (Als Bot posten)
            </div>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-white/10",
                selectedAuthor.id === "bot_grok" && "bg-sky-500/15 text-sky-200",
              )}
              onClick={() => {
                setSelectedAuthor({ type: "bot", id: "bot_grok", name: "Grok Bot", badge: "KI Bot" });
                setAuthorDropdownOpen(false);
              }}
            >
              <IconRobot className="size-4 text-emerald-400" />
              <span className="flex-1 font-medium">Grok Bot</span>
              {selectedAuthor.id === "bot_grok" && <IconCheck className="size-4 text-sky-400" />}
            </button>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-white/10",
                selectedAuthor.id === "bot_codex" && "bg-sky-500/15 text-sky-200",
              )}
              onClick={() => {
                setSelectedAuthor({ type: "bot", id: "bot_codex", name: "Codex Agent", badge: "KI Bot" });
                setAuthorDropdownOpen(false);
              }}
            >
              <IconRobot className="size-4 text-emerald-400" />
              <span className="flex-1 font-medium">Codex Agent</span>
              {selectedAuthor.id === "bot_codex" && <IconCheck className="size-4 text-sky-400" />}
            </button>
            {agents.map((ag) => (
              <button
                key={ag.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-white/10",
                  selectedAuthor.id === ag.id && "bg-sky-500/15 text-sky-200",
                )}
                onClick={() => {
                  setSelectedAuthor({ type: "bot", id: ag.id, name: ag.name, badge: "Bot" });
                  setAuthorDropdownOpen(false);
                }}
              >
                <IconRobot className="size-4 text-emerald-400" />
                <span className="flex-1 truncate font-medium">{ag.name}</span>
                {selectedAuthor.id === ag.id && <IconCheck className="size-4 text-sky-400" />}
              </button>
            ))}

            {/* Companies Section */}
            {companies.length > 0 && (
              <>
                <div className="mt-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Firmen
                </div>
                {companies.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-white/10",
                      selectedAuthor.id === c.id && "bg-sky-500/15 text-sky-200",
                    )}
                    onClick={() => {
                      setSelectedAuthor({ type: "company", id: c.id, name: c.name, badge: "Firma" });
                      setAuthorDropdownOpen(false);
                    }}
                  >
                    <IconBuilding className="size-4 text-amber-400" />
                    <span className="flex-1 truncate font-medium">{c.name}</span>
                    {selectedAuthor.id === c.id && <IconCheck className="size-4 text-sky-400" />}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Main Textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={
          selectedAuthor.type === "bot"
            ? `${selectedAuthor.name} generiert ein Update...`
            : "Was gibt's Neues in der Connect-Welt?"
        }
        className="min-h-[80px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-white outline-none placeholder:text-white/40"
        maxLength={2000}
        data-testid="composer-textarea"
      />

      {/* Image Previews */}
      {mediaList.length > 0 && (
        <div
          className={cn(
            "mt-3 grid gap-2",
            mediaList.length === 1 && "grid-cols-1",
            mediaList.length === 2 && "grid-cols-2",
            mediaList.length >= 3 && "grid-cols-2",
          )}
          data-testid="composer-image-previews"
        >
          {mediaList.map((m, idx) => (
            <div key={m.id} className="group relative overflow-hidden rounded-xl border border-white/15 bg-black/40">
              <img
                src={m.url}
                alt="Upload Preview"
                className="h-40 w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              <button
                type="button"
                onClick={() => removeMedia(idx)}
                className="absolute right-2 top-2 rounded-full bg-black/75 p-1 text-white shadow hover:bg-black"
                title="Bild entfernen"
              >
                <IconX className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-[13px] text-rose-400" role="alert">{error}</p>}

      {/* Footer Controls */}
      <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
        <div className="flex items-center gap-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={mediaList.length >= 4 || isUploading}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-sky-400 transition-colors hover:bg-sky-400/10 disabled:opacity-40"
            data-testid="attach-images-button"
          >
            <IconPhoto className="size-4" />
            <span>{isUploading ? "Lädt hoch…" : "Bilder"}</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[12px] text-white/40">{2000 - content.length}</span>
          <button
            type="button"
            disabled={isSubmitting || (!content.trim() && mediaList.length === 0)}
            onClick={handlePostSubmit}
            className="rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-1.5 text-[14px] font-bold text-white shadow-lg shadow-sky-500/20 transition-all hover:brightness-110 disabled:opacity-40"
            data-testid="submit-post-button"
          >
            {isSubmitting ? "Wird gepostet…" : "Posten"}
          </button>
        </div>
      </div>
    </div>
  );
}
