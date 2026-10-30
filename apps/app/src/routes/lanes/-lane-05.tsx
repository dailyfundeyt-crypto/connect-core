import React, { useState, useEffect } from "react";
import { BotPostComposer } from "@/components/social/bot-post-composer";
import { PostCardView } from "@/components/social/post-card-view";
import { CompanyProfilePage } from "@/components/social/company-profile-page";
import { ArticlesAndMarketplaceView } from "@/components/social/articles-and-marketplace";
import { IconHome, IconBuilding, IconFileText, IconShoppingBag, IconRefresh } from "@tabler/icons-react";
import type { SocialPost } from "@connect/contracts";

/**
 * Lane 05 Frontend Route (lazy loaded)
 * Social Posts, Articles, Media, Bot Listings & Rentals, Company Profile
 */
export function Lane05Route() {
  const [activeTab, setActiveTab] = useState<"feed" | "company" | "articles" | "marketplace">("feed");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/social/posts");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (e) {
      console.error("Failed to fetch lane 5 posts", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#07080c] text-white">
      {/* Top Bar Navigation */}
      <header className="flex flex-wrap items-center justify-between border-b border-white/10 bg-[#0c0e18]/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-sky-500/20 px-2 py-1 text-xs font-black uppercase tracking-wider text-sky-400">
            Lane 5
          </span>
          <h1 className="text-base font-bold text-white">Connect Sozial</h1>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => setActiveTab("feed")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "feed" ? "bg-sky-500 text-white shadow-md shadow-sky-500/20" : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            <IconHome className="size-3.5" /> Timeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("company")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "company" ? "bg-sky-500 text-white shadow-md shadow-sky-500/20" : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            <IconBuilding className="size-3.5" /> Firmenprofil
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("articles")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "articles" ? "bg-sky-500 text-white shadow-md shadow-sky-500/20" : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            <IconFileText className="size-3.5" /> Artikel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("marketplace")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "marketplace" ? "bg-sky-500 text-white shadow-md shadow-sky-500/20" : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            <IconShoppingBag className="size-3.5" /> Bot-Marktplatz
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === "feed" && (
          <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
            <BotPostComposer onPostCreated={loadPosts} />

            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/50">Timeline</h2>
              <button
                type="button"
                onClick={loadPosts}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-40"
              >
                <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
              </button>
            </div>

            <div className="space-y-4">
              {posts.length > 0 ? (
                posts.map((post) => (
                  <PostCardView key={post.id} post={post} onPostUpdated={loadPosts} />
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#0d0f1a]/50 p-8 text-center text-white/40">
                  {loading ? "Posts werden geladen..." : "Noch keine Posts vorhanden. Erstelle den ersten Beitrag oben!"}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "company" && (
          <CompanyProfilePage companyId="kunc_gmbh" />
        )}

        {activeTab === "articles" && (
          <ArticlesAndMarketplaceView defaultTab="articles" />
        )}

        {activeTab === "marketplace" && (
          <ArticlesAndMarketplaceView defaultTab="marketplace" />
        )}
      </main>
    </div>
  );
}

export default Lane05Route;
