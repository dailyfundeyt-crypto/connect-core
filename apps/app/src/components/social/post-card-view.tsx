import React, { useState } from "react";
import {
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
  IconRobot,
  IconBuilding,
  IconUser,
  IconSend,
  IconShare,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { SocialPost } from "@connect/contracts";

export interface PostCardViewProps {
  post: SocialPost;
  onPostUpdated?: () => void;
  className?: string;
}

export function PostCardView({ post, onPostUpdated, className }: PostCardViewProps) {
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isLiked, setIsLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Like Toggle
  const handleToggleLike = async () => {
    try {
      const nextLiked = !isLiked;
      setIsLiked(nextLiked);
      setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

      const res = await fetch(`/api/social/posts/${post.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "user_stefan" }),
      });
      if (res.ok) {
        const data = await res.json();
        setLikesCount(data.likesCount);
        setIsLiked(data.liked);
      }
    } catch (e) {
      console.error("Like toggle failed", e);
    }
  };

  // Load Comments
  const loadComments = async () => {
    if (!showComments) {
      setLoadingComments(true);
      try {
        const res = await fetch(`/api/social/posts/${post.id}/comments`);
        if (res.ok) {
          const data = await res.json();
          setComments(data.comments || []);
        }
      } catch (e) {
        console.error("Failed to load comments", e);
      } finally {
        setLoadingComments(false);
      }
    }
    setShowComments((v) => !v);
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/social/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentText.trim(),
          authorId: "user_stefan",
          authorType: "user",
          authorName: "Stefan Kunc",
        }),
      });

      if (res.ok) {
        const newComment = await res.json();
        setComments((prev) => [...prev, newComment]);
        setCommentText("");
        onPostUpdated?.();
      }
    } catch (err) {
      console.error("Comment submit failed", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  // Format Date
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <article
      className={cn(
        "rounded-2xl border border-white/10 bg-[#0c0d16]/90 p-4 transition-all duration-200 hover:border-white/20 shadow-md",
        className,
      )}
      data-testid="social-post-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500/20 to-blue-600/30 ring-1 ring-white/15">
            {post.authorType === "bot" ? (
              <IconRobot className="size-5 text-emerald-400" />
            ) : post.authorType === "company" ? (
              <IconBuilding className="size-5 text-amber-400" />
            ) : (
              <IconUser className="size-5 text-sky-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{post.authorName}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  post.authorType === "bot" && "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
                  post.authorType === "company" && "bg-amber-500/15 text-amber-300 border border-amber-500/20",
                  post.authorType === "user" && "bg-sky-500/15 text-sky-300 border border-sky-500/20",
                )}
              >
                {post.authorType === "bot" ? "KI BOT" : post.authorType === "company" ? "FIRMA" : "NUTZER"}
              </span>
            </div>
            <p className="text-[12px] text-white/40">{formatDate(post.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-3 text-[15px] leading-relaxed text-white/90 whitespace-pre-wrap">
        {post.content}
      </div>

      {/* Media Grid */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div
          className={cn(
            "mt-3 grid gap-2 overflow-hidden rounded-xl",
            post.mediaUrls.length === 1 && "grid-cols-1",
            post.mediaUrls.length === 2 && "grid-cols-2",
            post.mediaUrls.length >= 3 && "grid-cols-2",
          )}
          data-testid="post-media-grid"
        >
          {post.mediaUrls.map((url, idx) => (
            <div
              key={idx}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black/40"
              onClick={() => setLightboxImage(url)}
            >
              <img
                src={url}
                alt="Post attachment"
                className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
        <div className="flex items-center gap-6">
          {/* Like Button */}
          <button
            type="button"
            onClick={handleToggleLike}
            className={cn(
              "flex items-center gap-1.5 text-[13px] font-medium transition-colors",
              isLiked ? "text-rose-500" : "text-white/50 hover:text-rose-400",
            )}
            data-testid="like-post-button"
          >
            {isLiked ? <IconHeartFilled className="size-4.5" /> : <IconHeart className="size-4.5" />}
            <span>{likesCount}</span>
          </button>

          {/* Comment Button */}
          <button
            type="button"
            onClick={loadComments}
            className={cn(
              "flex items-center gap-1.5 text-[13px] font-medium transition-colors",
              showComments ? "text-sky-400" : "text-white/50 hover:text-sky-400",
            )}
            data-testid="toggle-comments-button"
          >
            <IconMessageCircle className="size-4.5" />
            <span>{comments.length || post.commentsCount}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.origin + `/social?p=${post.id}`);
          }}
          className="text-white/40 hover:text-white/80"
          title="Link kopieren"
        >
          <IconShare className="size-4" />
        </button>
      </div>

      {/* Inline Comments Section */}
      {showComments && (
        <div className="mt-3 border-t border-white/10 pt-3" data-testid="comments-section">
          {loadingComments ? (
            <div className="py-2 text-center text-[12px] text-white/40">Lädt Kommentare...</div>
          ) : comments.length > 0 ? (
            <div className="space-y-2 mb-3 max-h-56 overflow-y-auto pr-1">
              {comments.map((c) => (
                <div key={c.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5 text-[13px]">
                  <div className="flex items-center justify-between text-white/50 text-[11px] mb-1">
                    <span className="font-semibold text-white/80">{c.authorName}</span>
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-white/90 whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-[12px] text-white/40">Noch keine Kommentare. Sei der Erste!</p>
          )}

          {/* Add Comment Input */}
          <form onSubmit={handleAddComment} className="flex items-center gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Antwort verfassen..."
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-white outline-none focus:border-sky-400/50"
            />
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              className="rounded-full bg-sky-500 p-1.5 text-white hover:bg-sky-400 disabled:opacity-40"
              title="Kommentar absenden"
            >
              <IconSend className="size-4" />
            </button>
          </form>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Enlarged preview"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
          />
        </div>
      )}
    </article>
  );
}
