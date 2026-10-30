/**
 * Connect-Sozial: Timeline & Post-Karte mit Bilder-Galerie & Lightbox (v06 / A24)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  IconBuilding,
  IconRobot,
  IconFileText,
  IconFlask,
  IconPhoto,
  IconX,
  IconChevronLeft,
  IconChevronRight,
  IconHeart,
  IconMessageCircle,
  IconShare,
  IconTrash,
  IconSparkles,
  IconRotateClockwise,
} from "@tabler/icons-react";
import type { SocialPost, TimelineFilter } from "./types";
import { useSocialTimeline } from "./useSocial";
import { getFlag } from "@/contracts/v06/flags";
import { EmptyState, Skeleton } from "@/v06/design";

/* ========================================================================== */
/* Lightbox Modal Component                                                   */
/* ========================================================================== */

export interface LightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function LightboxModal({ images, initialIndex = 0, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const prevImage = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const nextImage = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "ArrowRight") nextImage();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, prevImage, nextImage]);

  if (!images || images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="social-lightbox-overlay"
    >
      {/* Top Bar with counter and close button */}
      <div
        className="absolute top-4 left-4 right-4 flex items-center justify-between text-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium bg-black/50 px-3 py-1 rounded-full border border-white/10">
          {currentIndex + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
          title="Schließen (Esc)"
          data-testid="lightbox-close-button"
        >
          <IconX className="size-5" />
        </button>
      </div>

      {/* Main Image View */}
      <div
        className="relative max-h-[85vh] max-w-[90vw] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={images[currentIndex]}
          alt={`Bild ${currentIndex + 1}`}
          className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          data-testid="lightbox-active-image"
        />

        {/* Previous Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={prevImage}
            className="absolute left-2 -translate-x-12 sm:translate-x-0 rounded-full bg-black/60 hover:bg-black/80 text-white p-2.5 transition-all border border-white/15"
            title="Vorheriges Bild (Links)"
            data-testid="lightbox-prev-button"
          >
            <IconChevronLeft className="size-6" />
          </button>
        )}

        {/* Next Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={nextImage}
            className="absolute right-2 translate-x-12 sm:translate-x-0 rounded-full bg-black/60 hover:bg-black/80 text-white p-2.5 transition-all border border-white/15"
            title="Nächstes Bild (Rechts)"
            data-testid="lightbox-next-button"
          >
            <IconChevronRight className="size-6" />
          </button>
        )}
      </div>

      {/* Thumbnails below if multiple */}
      {images.length > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 max-w-[90vw] overflow-x-auto p-2 bg-black/60 rounded-xl border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => (
            <button
              type="button"
              key={img}
              onClick={() => setCurrentIndex(idx)}
              className={`relative size-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                idx === currentIndex ? "border-sky-400 scale-105" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={img} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Bilder-Galerie Component                                                   */
/* ========================================================================== */

export function PostMediaGallery({ images }: { images: string[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30" data-testid="post-media-gallery">
        {images.length === 1 && (
          <div
            className="relative cursor-pointer overflow-hidden group max-h-96"
            onClick={() => setLightboxIndex(0)}
          >
            <img
              src={images[0]}
              alt="Post Medium"
              className="w-full h-auto max-h-96 object-cover transition-transform duration-300 group-hover:scale-[1.01]"
              loading="lazy"
            />
          </div>
        )}

        {images.length === 2 && (
          <div className="grid grid-cols-2 gap-1 max-h-80">
            {images.map((url, idx) => (
              <div
                key={url}
                className="relative cursor-pointer overflow-hidden group aspect-4/3 bg-black/40"
                onClick={() => setLightboxIndex(idx)}
              >
                <img
                  src={url}
                  alt={`Medium ${idx + 1}`}
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}

        {images.length === 3 && (
          <div className="grid grid-cols-3 gap-1 max-h-80">
            <div
              className="col-span-2 relative cursor-pointer overflow-hidden group aspect-4/3 bg-black/40"
              onClick={() => setLightboxIndex(0)}
            >
              <img
                src={images[0]}
                alt="Medium 1"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            <div className="grid grid-rows-2 gap-1">
              {images.slice(1, 3).map((url, idx) => (
                <div
                  key={url}
                  className="relative cursor-pointer overflow-hidden group aspect-square bg-black/40"
                  onClick={() => setLightboxIndex(idx + 1)}
                >
                  <img
                    src={url}
                    alt={`Medium ${idx + 2}`}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {images.length >= 4 && (
          <div className="grid grid-cols-2 gap-1 max-h-80">
            {images.slice(0, 4).map((url, idx) => {
              const isFourth = idx === 3;
              const remaining = images.length - 4;
              return (
                <div
                  key={url}
                  className="relative cursor-pointer overflow-hidden group aspect-4/3 bg-black/40"
                  onClick={() => setLightboxIndex(idx)}
                >
                  <img
                    src={url}
                    alt={`Medium ${idx + 1}`}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  {isFourth && remaining > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 font-bold text-white text-xl backdrop-blur-xs">
                      +{remaining} weitere
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lightboxIndex !== null && (
        <LightboxModal
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

/* ========================================================================== */
/* Post-Karte Component                                                       */
/* ========================================================================== */

export interface PostCardProps {
  post: SocialPost;
  currentCompanyId?: string;
  onOpenCompany?: (companyId: string) => void;
  onOpenArticle?: (articleId: string) => void;
  onOpenProject?: (projectId: string) => void;
  onArchive?: (postId: string) => void;
}

export function PostCard({
  post,
  currentCompanyId,
  onOpenCompany,
  onOpenArticle,
  onOpenProject,
  onArchive,
}: PostCardProps) {
  const [likes, setLikes] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);

  const formatTimestamp = (iso: string) => {
    try {
      const date = new Date(iso);
      return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasLiked((prev) => !prev);
    setLikes((prev) => (hasLiked ? prev - 1 : prev + 1));
  };

  const isOwner = currentCompanyId && post.authorCompanyId === currentCompanyId;
  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <article
        className="group relative rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-5 shadow-sm transition-all duration-180 hover:border-[var(--p-border-strong)] hover:shadow-md"
        data-testid={`social-post-card-${post.id}`}
      >
        {/* Header: Author & Badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              onClick={() => onOpenCompany?.(post.authorCompanyId)}
              className="flex size-10 cursor-pointer items-center justify-center rounded-[var(--p-radius-md)] border border-[var(--p-accent)]/30 bg-[var(--p-accent)]/15 text-[var(--p-accent)] font-bold hover:scale-105 transition-transform"
            >
              {post.authorBotId ? <IconRobot className="size-5" /> : <IconBuilding className="size-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpenCompany?.(post.authorCompanyId)}
                  className="text-[14px] font-bold text-[var(--p-text-1)] hover:text-[var(--p-accent)] transition-colors"
                  data-testid="post-author-link"
                >
                  {post.authorCompanyId}
                </button>

                {post.authorBotId && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--p-accent)]/10 border border-[var(--p-accent)]/25 px-2 py-0.5 text-[11px] font-medium text-[var(--p-accent)]"
                    data-testid="post-bot-badge"
                  >
                    <IconRobot className="size-3" />
                    Bot: {post.authorBotId}
                  </span>
                )}

                {/* Kind Badge */}
                {post.kind === "article" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
                    <IconFileText className="size-3" /> Artikel
                  </span>
                )}
                {post.kind === "project_update" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                    <IconFlask className="size-3" /> Forschung
                  </span>
                )}
              </div>

              <span className="text-[12px] text-[var(--p-text-3)]">{formatTimestamp(post.createdAt)}</span>
            </div>
          </div>

          {/* Action Controls (Archive if owner) */}
          {isOwner && onArchive && (
            <button
              type="button"
              onClick={() => onArchive(post.id)}
              className="opacity-0 group-hover:opacity-100 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:text-rose-400 hover:bg-rose-500/10 transition-all"
              title="Beitrag archivieren"
              data-testid="post-archive-button"
            >
              <IconTrash className="size-4" />
            </button>
          )}
        </div>

        {/* Post Text */}
        <div className="mt-3 text-[14px] leading-relaxed text-[var(--p-text-1)] whitespace-pre-wrap font-sans">
          {post.text}
        </div>

        {/* Bilder-Galerie */}
        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <PostMediaGallery images={post.mediaUrls} />
        )}

        {/* Special Content Link Buttons */}
        {post.kind === "article" && onOpenArticle && (
          <div className="mt-4 pt-3 border-t border-[var(--p-border)]">
            <button
              type="button"
              onClick={() => onOpenArticle(post.id)}
              className="flex min-h-[44px] items-center gap-2 rounded-[var(--p-radius-md)] bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 px-3.5 py-2 text-[13px] font-semibold text-[var(--p-accent)] hover:bg-[var(--p-accent)]/25 transition-colors"
            >
              <IconFileText className="size-4" />
              Vollständigen Artikel lesen
            </button>
          </div>
        )}

        {post.kind === "project_update" && onOpenProject && (
          <div className="mt-4 pt-3 border-t border-[var(--p-border)]">
            <button
              type="button"
              onClick={() => onOpenProject(post.id)}
              className="flex min-h-[44px] items-center gap-2 rounded-[var(--p-radius-md)] bg-amber-500/15 border border-amber-500/30 px-3.5 py-2 text-[13px] font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors"
            >
              <IconFlask className="size-4" />
              Forschungsprojekt öffnen
            </button>
          </div>
        )}

        {/* Card Footer: Interactive Metrics */}
        <div className="mt-4 flex items-center justify-between border-t border-[var(--p-border)] pt-3 text-[13px] text-[var(--p-text-3)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLike}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-[var(--p-radius-md)] px-2.5 hover:text-rose-400 hover:bg-[var(--p-surface-3)] transition-all ${
                hasLiked ? "text-rose-400" : ""
              }`}
              data-testid="post-like-button"
            >
              <IconHeart className={`size-4 ${hasLiked ? "fill-current" : ""}`} />
              <span>{likes > 0 ? likes : ""}</span>
            </button>

            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-[var(--p-radius-md)] px-2.5 hover:text-[var(--p-accent)] hover:bg-[var(--p-surface-3)] transition-all"
            >
              <IconMessageCircle className="size-4" />
              <span>Kommentare</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (navigator.clipboard) {
                void navigator.clipboard.writeText(window.location.href);
              }
            }}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--p-radius-md)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] transition-all"
            title="Link kopieren"
          >
            <IconShare className="size-4" />
          </button>
        </div>
      </article>
    );
  }

  return (
    <article
      className="group relative rounded-2xl border border-white/10 bg-[#0c0d16]/80 p-5 shadow-lg backdrop-blur-xs transition-all hover:border-white/20"
      data-testid={`social-post-card-${post.id}`}
    >
      {/* Header: Author & Badges */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            onClick={() => onOpenCompany?.(post.authorCompanyId)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/30 text-sky-400 font-bold hover:scale-105 transition-transform"
          >
            {post.authorBotId ? <IconRobot className="size-5" /> : <IconBuilding className="size-5" />}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onOpenCompany?.(post.authorCompanyId)}
                className="text-[14px] font-bold text-white hover:text-sky-400 transition-colors"
                data-testid="post-author-link"
              >
                {post.authorCompanyId}
              </button>

              {post.authorBotId && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[11px] font-medium text-emerald-400"
                  data-testid="post-bot-badge"
                >
                  <IconRobot className="size-3" />
                  Bot: {post.authorBotId}
                </span>
              )}

              {/* Kind Badge */}
              {post.kind === "article" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 text-[11px] font-medium text-indigo-400">
                  <IconFileText className="size-3" /> Artikel
                </span>
              )}
              {post.kind === "project_update" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                  <IconFlask className="size-3" /> Forschung
                </span>
              )}
            </div>

            <span className="text-[12px] text-white/50">{formatTimestamp(post.createdAt)}</span>
          </div>
        </div>

        {/* Action Controls (Archive if owner) */}
        {isOwner && onArchive && (
          <button
            type="button"
            onClick={() => onArchive(post.id)}
            className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            title="Beitrag archivieren"
            data-testid="post-archive-button"
          >
            <IconTrash className="size-4" />
          </button>
        )}
      </div>

      {/* Post Text */}
      <div className="mt-3 text-[14px] leading-relaxed text-white/90 whitespace-pre-wrap font-sans">
        {post.text}
      </div>

      {/* Bilder-Galerie */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <PostMediaGallery images={post.mediaUrls} />
      )}

      {/* Special Content Link Buttons */}
      {post.kind === "article" && onOpenArticle && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={() => onOpenArticle(post.id)}
            className="flex items-center gap-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 px-3.5 py-2 text-[13px] font-semibold text-indigo-300 hover:bg-indigo-500/25 transition-colors"
          >
            <IconFileText className="size-4" />
            Vollständigen Artikel lesen
          </button>
        </div>
      )}

      {post.kind === "project_update" && onOpenProject && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={() => onOpenProject(post.id)}
            className="flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3.5 py-2 text-[13px] font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors"
          >
            <IconFlask className="size-4" />
            Forschungsprojekt öffnen
          </button>
        </div>
      )}

      {/* Card Footer: Interactive Metrics */}
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[13px] text-white/50">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={handleLike}
            className={`flex items-center gap-1.5 hover:text-rose-400 transition-colors ${
              hasLiked ? "text-rose-400" : ""
            }`}
            data-testid="post-like-button"
          >
            <IconHeart className={`size-4 ${hasLiked ? "fill-current" : ""}`} />
            <span>{likes > 0 ? likes : ""}</span>
          </button>

          <button
            type="button"
            className="flex items-center gap-1.5 hover:text-sky-400 transition-colors"
          >
            <IconMessageCircle className="size-4" />
            <span>Kommentare</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (navigator.clipboard) {
              void navigator.clipboard.writeText(window.location.href);
            }
          }}
          className="flex items-center gap-1 hover:text-white transition-colors"
          title="Link kopieren"
        >
          <IconShare className="size-4" />
        </button>
      </div>
    </article>
  );
}

/* ========================================================================== */
/* Main Timeline View Component                                              */
/* ========================================================================== */

export interface TimelineProps {
  currentCompanyId?: string;
  composerSlot?: React.ReactNode;
  onOpenCompany?: (companyId: string) => void;
  onOpenArticle?: (articleId: string) => void;
  onOpenProject?: (projectId: string) => void;
}

export function Timeline({
  currentCompanyId = "kunc_gmbh",
  composerSlot,
  onOpenCompany,
  onOpenArticle,
  onOpenProject,
}: TimelineProps) {
  const [filter, setFilter] = useState<TimelineFilter>("for-you");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const {
    posts,
    isLoading,
    isError,
    error,
    refetch,
    archivePost,
  } = useSocialTimeline({
    filter,
    kind: kindFilter === "all" ? undefined : (kindFilter as any),
  });

  const handleArchive = async (postId: string) => {
    try {
      await archivePost(postId);
    } catch (err: any) {
      console.error("Archivieren fehlgeschlagen", err);
    }
  };

  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6 text-[var(--p-text-1)]" data-testid="social-timeline-container">
        {/* Top Filter & Pill-Switcher */}
        <div className="flex items-center justify-between border-b border-[var(--p-border)] pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter("for-you")}
              className={`rounded-full min-h-[44px] px-5 py-2 text-[13px] font-bold transition-all ${
                filter === "for-you"
                  ? "bg-[var(--p-accent)] text-zinc-950 shadow-md"
                  : "bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
              }`}
              data-testid="timeline-tab-for-you"
            >
              Für dich
            </button>
            <button
              type="button"
              onClick={() => setFilter("following")}
              className={`rounded-full min-h-[44px] px-5 py-2 text-[13px] font-bold transition-all ${
                filter === "following"
                  ? "bg-[var(--p-accent)] text-zinc-950 shadow-md"
                  : "bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
              }`}
              data-testid="timeline-tab-following"
            >
              Folge ich
            </button>
          </div>

          {/* Kind Filters */}
          <div className="flex items-center gap-1.5 text-[12px]">
            {["all", "post", "article", "project_update"].map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKindFilter(k)}
                className={`min-h-[36px] rounded-[var(--p-radius-md)] px-3 py-1.5 font-medium transition-colors ${
                  kindFilter === k
                    ? "bg-[var(--p-surface-3)] border border-[var(--p-border-strong)] text-[var(--p-text-1)]"
                    : "border border-transparent text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                }`}
              >
                {k === "all"
                  ? "Alle"
                  : k === "post"
                  ? "Posts"
                  : k === "article"
                  ? "Artikel"
                  : "Forschung"}
              </button>
            ))}

            <button
              type="button"
              onClick={() => void refetch()}
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-[var(--p-radius-md)] p-2 text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)] ml-1 transition-colors"
              title="Aktualisieren"
            >
              <IconRotateClockwise className="size-4" />
            </button>
          </div>
        </div>

        {/* Composer Einhängepunkt */}
        {composerSlot}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="space-y-4" data-testid="timeline-loading-skeleton">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-5 space-y-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton variant="circle" width={40} height={40} />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton variant="text" width="30%" height={14} />
                    <Skeleton variant="text" width="20%" height={10} />
                  </div>
                </div>
                <Skeleton variant="rect" height={64} className="rounded-[var(--p-radius-md)]" />
              </div>
            ))}
          </div>
        )}

        {/* Error View */}
        {isError && (
          <div className="rounded-[var(--p-radius-lg)] border border-[var(--p-danger)]/30 bg-[var(--p-danger)]/10 p-5 text-center text-rose-300">
            <p className="font-semibold">{error?.message || "Fehler beim Laden der Timeline."}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 min-h-[44px] rounded-full bg-[var(--p-danger)]/20 border border-[var(--p-danger)]/40 px-4 py-2 text-xs font-bold text-white hover:bg-[var(--p-danger)]/30"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {/* Posts Feed */}
        {!isLoading && !isError && (
          <div className="space-y-4" data-testid="timeline-posts-feed">
            {posts.length > 0 ? (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentCompanyId={currentCompanyId}
                  onOpenCompany={onOpenCompany}
                  onOpenArticle={onOpenArticle}
                  onOpenProject={onOpenProject}
                  onArchive={handleArchive}
                />
              ))
            ) : (
              <div className="py-6" data-testid="timeline-empty-state">
                <EmptyState
                  icon={<IconSparkles className="size-6 text-[var(--p-accent)]" />}
                  title="Noch keine Beiträge"
                  description={
                    filter === "following"
                      ? "Unternehmen, denen du folgst, haben noch keine Updates veröffentlicht."
                      : "Erstelle den ersten Beitrag und teile Unternehmens-News oder Forschungsergebnisse!"
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6" data-testid="social-timeline-container">
      {/* Top Filter & Pill-Switcher */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("for-you")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition-all ${
              filter === "for-you"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
            data-testid="timeline-tab-for-you"
          >
            Für dich
          </button>
          <button
            type="button"
            onClick={() => setFilter("following")}
            className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition-all ${
              filter === "following"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
            data-testid="timeline-tab-following"
          >
            Folge ich
          </button>
        </div>

        {/* Kind Filters */}
        <div className="flex items-center gap-1.5 text-[12px]">
          {["all", "post", "article", "project_update"].map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKindFilter(k)}
              className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
                kindFilter === k
                  ? "bg-white/20 text-white"
                  : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
            >
              {k === "all"
                ? "Alle"
                : k === "post"
                ? "Posts"
                : k === "article"
                ? "Artikel"
                : "Forschung"}
            </button>
          ))}

          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/10 ml-1 transition-colors"
            title="Aktualisieren"
          >
            <IconRotateClockwise className="size-4" />
          </button>
        </div>
      </div>

      {/* Composer Einhängepunkt */}
      {composerSlot}

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="space-y-4" data-testid="timeline-loading-skeleton">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-2xl border border-white/10 bg-white/5 p-5 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-white/10" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-28 rounded bg-white/10" />
                  <div className="h-2.5 w-20 rounded bg-white/5" />
                </div>
              </div>
              <div className="h-16 rounded-lg bg-white/5" />
            </div>
          ))}
        </div>
      )}

      {/* Error View */}
      {isError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 text-center text-rose-300">
          <p className="font-semibold">{error?.message || "Fehler beim Laden der Timeline."}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-full bg-rose-500/20 border border-rose-500/40 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-500/30"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      {/* Posts Feed */}
      {!isLoading && !isError && (
        <div className="space-y-4" data-testid="timeline-posts-feed">
          {posts.length > 0 ? (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentCompanyId={currentCompanyId}
                onOpenCompany={onOpenCompany}
                onOpenArticle={onOpenArticle}
                onOpenProject={onOpenProject}
                onArchive={handleArchive}
              />
            ))
          ) : (
            <div
              className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-10 text-center"
              data-testid="timeline-empty-state"
            >
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 mb-3">
                <IconSparkles className="size-6" />
              </div>
              <h4 className="text-base font-bold text-white">Noch keine Beiträge</h4>
              <p className="mt-1 text-[13px] text-white/50 max-w-sm mx-auto">
                {filter === "following"
                  ? "Unternehmen, denen du folgst, haben noch keine Updates veröffentlicht."
                  : "Erstelle den ersten Beitrag und teile Unternehmens-News oder Forschungsergebnisse!"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Timeline;
