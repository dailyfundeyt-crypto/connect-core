/**
 * Connect-Sozial: CompanyProfilePage (v06 / A24)
 *
 * Vollständige Firmenprofil-Seite für Connect Sozial.
 * Bereitgestellt für Route ROUTES_V06.socialCompanyProfile (und Sidebar-Button „Firmenprofil“).
 * Aggregiert Metadaten, Posts, Artikel, Forschungsprojekte, Bots und Kennzahlen.
 */

import React, { useState } from "react";
import {
  IconBuilding,
  IconGlobe,
  IconRobot,
  IconFileText,
  IconFlask,
  IconHeartHandshake,
  IconArrowLeft,
  IconSparkles,
  IconShare,
  IconExternalLink,
  IconPlus,
} from "@tabler/icons-react";
import { useCompanySocialProfile, useSocialTimeline } from "./useSocial";
import { PostCard } from "./Timeline";
import { Composer } from "./Composer";
import { ArticleOfferDisplayCard } from "./ArticleEditorOffer";
import type { CompanySocialProfile } from "./types";

export interface CompanyProfilePageProps {
  companyId?: string;
  onBack?: () => void;
  onOpenArticle?: (articleId: string) => void;
  onOpenProject?: (projectId: string) => void;
  currentCompanyId?: string;
  className?: string;
}

export function CompanyProfilePage({
  companyId = "kunc_gmbh",
  onBack,
  onOpenArticle,
  onOpenProject,
  currentCompanyId = "kunc_gmbh",
  className = "",
}: CompanyProfilePageProps) {
  const [activeTab, setActiveTab] = useState<"posts" | "articles" | "projects" | "bots" | "donations">("posts");
  const { profile, isLoading, isError, error, refetch } = useCompanySocialProfile(companyId);

  const isOwner = currentCompanyId === companyId;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-white/50" data-testid="company-profile-loading">
        <div className="flex items-center gap-2">
          <IconBuilding className="size-6 animate-pulse text-sky-400" />
          <span>Firmenprofil wird geladen…</span>
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center text-rose-300">
        <p className="font-semibold">{error?.message || "Firmenprofil konnte nicht geladen werden."}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white hover:bg-white/20"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto max-w-4xl px-4 py-6 text-white space-y-6 ${className}`}
      data-testid="company-social-profile-page"
    >
      {/* Top Back & Share Bar */}
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 hover:text-white transition-colors"
            data-testid="company-profile-back-button"
          >
            <IconArrowLeft className="size-4" />
            <span>Zurück</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={() => {
            if (navigator.clipboard) {
              void navigator.clipboard.writeText(window.location.href);
            }
          }}
          className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-[12px] text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <IconShare className="size-3.5" />
          <span>Profil teilen</span>
        </button>
      </div>

      {/* Header Banner & Info Card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0d0f1e] shadow-2xl">
        {/* Cover Gradient / Pattern */}
        <div className="h-36 w-full bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-700 opacity-80" />

        <div className="px-6 pb-6 pt-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-14 mb-4">
            {/* Avatar & Title */}
            <div className="flex items-end gap-4">
              <div className="flex size-24 items-center justify-center rounded-2xl bg-[#090a14] border-4 border-[#0d0f1e] text-sky-400 shadow-2xl">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="size-full rounded-xl object-cover" />
                ) : (
                  <IconBuilding className="size-12" />
                )}
              </div>

              <div className="mb-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-white" data-testid="company-profile-name">
                    {profile.name}
                  </h1>
                  <span className="rounded-full bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    Verifiziert
                  </span>
                </div>
                <span className="text-[12px] text-white/40">@{profile.companyId}</span>
              </div>
            </div>

            {/* Links & Website */}
            {profile.websiteUrl && (
              <a
                href={profile.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3.5 py-1.5 text-[12px] font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <IconGlobe className="size-3.5 text-sky-400" />
                <span>{profile.websiteUrl.replace(/^https?:\/\//, "")}</span>
                <IconExternalLink className="size-3 text-white/40" />
              </a>
            )}
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="mt-2 text-[14px] leading-relaxed text-white/80 max-w-2xl font-sans">
              {profile.bio}
            </p>
          )}

          {/* Stats Bar */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3 border-t border-white/10 pt-4 text-center">
            <button
              type="button"
              onClick={() => setActiveTab("posts")}
              className={`rounded-xl p-2.5 transition-all text-center ${
                activeTab === "posts" ? "bg-white/10 ring-1 ring-white/30" : "bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <div className="text-[18px] font-black text-white">{profile.stats.postsCount}</div>
              <div className="text-[11px] font-medium text-white/50">Beiträge</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("articles")}
              className={`rounded-xl p-2.5 transition-all text-center ${
                activeTab === "articles" ? "bg-indigo-500/15 ring-1 ring-indigo-500/30" : "bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <div className="text-[18px] font-black text-indigo-400">{profile.stats.articlesCount}</div>
              <div className="text-[11px] font-medium text-white/50">Artikel</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("projects")}
              className={`rounded-xl p-2.5 transition-all text-center ${
                activeTab === "projects" ? "bg-amber-500/15 ring-1 ring-amber-500/30" : "bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <div className="text-[18px] font-black text-amber-400">{profile.stats.projectsCount}</div>
              <div className="text-[11px] font-medium text-white/50">Forschung</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bots")}
              className={`rounded-xl p-2.5 transition-all text-center ${
                activeTab === "bots" ? "bg-emerald-500/15 ring-1 ring-emerald-500/30" : "bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <div className="text-[18px] font-black text-emerald-400">{profile.stats.botOffersCount}</div>
              <div className="text-[11px] font-medium text-white/50">Bot-Angebote</div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("donations")}
              className={`rounded-xl p-2.5 transition-all text-center col-span-2 sm:col-span-1 ${
                activeTab === "donations" ? "bg-rose-500/15 ring-1 ring-rose-500/30" : "bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <div className="text-[18px] font-black text-rose-400">{profile.stats.donationsCount}</div>
              <div className="text-[11px] font-medium text-white/50">Spenden</div>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("posts")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all shrink-0 ${
            activeTab === "posts"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="company-tab-posts"
        >
          <span>Beiträge ({profile.posts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("articles")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all shrink-0 ${
            activeTab === "articles"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="company-tab-articles"
        >
          <IconFileText className="size-4" />
          <span>Artikel ({profile.articles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("projects")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all shrink-0 ${
            activeTab === "projects"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="company-tab-projects"
        >
          <IconFlask className="size-4" />
          <span>Projekte ({profile.projects.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bots")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all shrink-0 ${
            activeTab === "bots"
              ? "bg-sky-500 text-white shadow-md shadow-sky-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="company-tab-bots"
        >
          <IconRobot className="size-4" />
          <span>Bots & Angebote</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("donations")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold transition-all shrink-0 ${
            activeTab === "donations"
              ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
          data-testid="company-tab-donations"
        >
          <IconHeartHandshake className="size-4" />
          <span>Spenden ({profile.stats.donationsCount})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="space-y-4">
        {/* Tab 1: Posts Feed & Composer */}
        {activeTab === "posts" && (
          <div className="space-y-4">
            {isOwner && (
              <Composer
                companyId={companyId}
                placeholder="Verfasse ein Update für deine Unternehmens-Timeline..."
                onPostCreated={() => void refetch()}
              />
            )}

            {profile.posts.length > 0 ? (
              profile.posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  currentCompanyId={currentCompanyId}
                  onOpenArticle={onOpenArticle}
                  onOpenProject={onOpenProject}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-white/40 text-[13px]">
                Keine Beiträge vorhanden.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Articles */}
        {activeTab === "articles" && (
          <div className="space-y-4" data-testid="company-articles-list">
            {profile.articles.length > 0 ? (
              profile.articles.map((art) => (
                <div
                  key={art.id}
                  className="rounded-2xl border border-white/10 bg-[#0d0e1c] p-5 shadow-lg space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-white hover:text-sky-400 transition-colors cursor-pointer"
                        onClick={() => onOpenArticle?.(art.id)}
                      >
                        {art.title}
                      </h3>
                      <p className="mt-1 text-[13px] text-white/60 line-clamp-2">{art.summary || art.content}</p>
                    </div>
                    {art.attachedOffer && (
                      <span className="shrink-0 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-1 text-[11px] font-bold text-indigo-300">
                        🤖 Bot-Angebot
                      </span>
                    )}
                  </div>

                  {/* Attached Offer Card if present */}
                  {art.attachedOffer && (
                    <div className="mt-3">
                      <ArticleOfferDisplayCard offer={art.attachedOffer} />
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[12px] text-white/40 pt-2 border-t border-white/5">
                    <span>{new Date(art.createdAt).toLocaleDateString("de-DE")}</span>
                    {onOpenArticle && (
                      <button
                        type="button"
                        onClick={() => onOpenArticle(art.id)}
                        className="font-semibold text-indigo-400 hover:underline"
                      >
                        Vollständigen Artikel lesen →
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-white/40 text-[13px]">
                Keine Artikel veröffentlicht.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Research Projects */}
        {activeTab === "projects" && (
          <div className="space-y-4" data-testid="company-projects-list">
            {profile.projects.length > 0 ? (
              profile.projects.map((proj) => (
                <div
                  key={proj.id}
                  className="rounded-2xl border border-white/10 bg-[#0d0e1c] p-5 shadow-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                        <IconFlask className="size-5" />
                      </div>
                      <div>
                        <h4
                          className="text-[15px] font-bold text-white hover:text-amber-400 cursor-pointer transition-colors"
                          onClick={() => onOpenProject?.(proj.id)}
                        >
                          {proj.title}
                        </h4>
                        <span className="text-[11px] text-white/50">Status: {proj.status}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenProject?.(proj.id)}
                      className="rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-[12px] font-bold text-amber-300 hover:bg-amber-500/30 transition-colors"
                    >
                      Projekt ansehen
                    </button>
                  </div>

                  <p className="text-[13px] text-white/70 line-clamp-2">{proj.goal}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-white/40 text-[13px]">
                Keine Forschungsprojekte angelegt.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Bots & Offers */}
        {activeTab === "bots" && (
          <div className="space-y-4" data-testid="company-bots-list">
            {profile.articles.filter((a) => a.attachedOffer).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profile.articles
                  .filter((a) => a.attachedOffer)
                  .map((a) => (
                    <ArticleOfferDisplayCard
                      key={a.id}
                      offer={a.attachedOffer!}
                      botName={a.title}
                    />
                  ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-white/40 text-[13px]">
                Keine aktiven Bot-Angebote in Artikeln verknüpft.
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Spenden-Visualisierung & Schwarm-Quota */}
        {activeTab === "donations" && (
          <div className="space-y-5" data-testid="company-donations-view">
            {/* KPI Summary Card */}
            <div className="rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-950/30 to-[#0e101f] p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
                    <IconHeartHandshake className="size-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Schwarm-Rechenzeit & Bot-Spenden</h3>
                    <p className="text-[12px] text-white/60">
                      Übersicht der von {profile.name} an Forschungsprojekte gespendeten Bot-Kapazitäten.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xl font-black text-rose-400">{profile.stats.donationsCount}</div>
                    <div className="text-[11px] text-white/40">Registrierte Spenden</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Info & Guidance */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[13px] text-white/70 space-y-2">
              <div className="flex items-center gap-2 font-bold text-white">
                <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Autonome Schwarm-Ausführung aktiv</span>
              </div>
              <p className="text-[12px] text-white/50 leading-relaxed">
                Deine gespendeten Bots unterstützen dezentrale Forschungsprojekte bei der Ausführung von Aufgaben im Aufgabenbaum (DAG).
                Jede Spende stellt dem Projekt ein tägliches Kontingent zur Verfügung, das sich um Mitternacht automatisch erneuert.
              </p>
            </div>

            {/* Quick action to support more projects */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveTab("projects")}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 px-4 py-2 text-[12px] font-bold text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                <IconFlask className="size-4" />
                <span>Offene Projekte durchsuchen</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CompanyProfilePage;
