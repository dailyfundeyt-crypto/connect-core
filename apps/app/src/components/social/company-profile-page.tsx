import React, { useState, useEffect } from "react";
import {
  IconBuilding,
  IconRobot,
  IconFlask,
  IconMessageCircle,
  IconShoppingBag,
  IconPencil,
  IconGlobe,
  IconMapPin,
  IconCheck,
  IconX,
  IconPlus,
} from "@tabler/icons-react";
import { getCompany, listCompanies } from "@/lib/companies/store";
import { useQuery } from "@tanstack/react-query";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { cn } from "@/lib/utils";
import { BotPostComposer } from "./bot-post-composer";
import { PostCardView } from "./post-card-view";
import { CompanyProjectsSlot } from "./projects/company-projects-slot";
import type { SocialPost, BotListing } from "@connect/contracts";

export interface CompanyProfilePageProps {
  companyId: string;
  className?: string;
  onBack?: () => void;
}

export function CompanyProfilePage({ companyId, className, onBack }: CompanyProfilePageProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "bots" | "projects" | "posts" | "listings">("overview");
  const [companyData, setCompanyData] = useState<any>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [listings, setListings] = useState<BotListing[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editLocation, setEditLocation] = useState("");

  const localCompany = getCompany(companyId);
  const agentsQuery = useQuery(agentListQueryOptions());
  const allAgents = agentsQuery.data ?? [];

  // Load company details, posts and listings
  const loadCompanyData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/social/company/${encodeURIComponent(companyId)}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setListings(data.listings || []);
      }

      // Base info
      const company = localCompany || {
        id: companyId,
        name: "Kunc GmbH",
        description: "KI-Agenten & Automatisierungslösungen für Unternehmen",
        website: "https://kunc.de",
        location: "Deutschland",
        category: "Technologie",
        accent: "#0284c7",
      };

      setCompanyData(company);
      setEditName(company.name || "");
      setEditBio(company.description || "");
      setEditWebsite(company.website || "");
      setEditLocation(company.location || "");
    } catch (err) {
      console.error("Failed to load company overview", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanyData();
  }, [companyId]);

  const handleSaveProfile = () => {
    setCompanyData((prev: any) => ({
      ...prev,
      name: editName,
      description: editBio,
      website: editWebsite,
      location: editLocation,
    }));
    setIsEditing(false);
  };

  return (
    <div
      className={cn("min-h-full bg-[#080911] text-white pb-12", className)}
      data-testid="company-profile-page"
    >
      {/* Banner & Header */}
      <div className="relative h-44 w-full bg-gradient-to-r from-sky-900 via-indigo-900 to-slate-900 border-b border-white/10">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" />
      </div>

      {/* Profile Overview Card */}
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <div className="-mt-16 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <div className="flex size-24 sm:size-28 items-center justify-center rounded-3xl border-4 border-[#080911] bg-gradient-to-tr from-sky-600 to-indigo-600 shadow-2xl">
              <IconBuilding className="size-12 sm:size-14 text-white" />
            </div>
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  {companyData?.name || "Unternehmen"}
                </h1>
                <span className="rounded-full bg-sky-500/20 border border-sky-400/30 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-300">
                  Verifiziert
                </span>
              </div>
              <p className="text-[13px] text-white/60">@{companyId.replace(/[^a-z0-9]/gi, "").toLowerCase()}</p>
            </div>
          </div>

          <div className="mb-2 flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/15"
                data-testid="edit-company-profile-button"
              >
                <IconPencil className="size-4" />
                <span>Profil bearbeiten</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="flex items-center gap-1 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[13px] font-bold text-white hover:bg-emerald-400"
                >
                  <IconCheck className="size-4" /> Speichern
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-[13px] text-white/70 hover:bg-white/10"
                >
                  <IconX className="size-4" /> Abbrechen
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bio & Details */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-[#0e101b]/80 p-5 shadow-lg backdrop-blur-md">
          {!isEditing ? (
            <>
              <p className="text-[15px] leading-relaxed text-white/85">
                {companyData?.description || "Keine Unternehmensbeschreibung hinterlegt."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-[13px] text-white/50 border-t border-white/5 pt-3">
                {companyData?.location && (
                  <div className="flex items-center gap-1">
                    <IconMapPin className="size-4 text-sky-400" />
                    <span>{companyData.location}</span>
                  </div>
                )}
                {companyData?.website && (
                  <a
                    href={companyData.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    <IconGlobe className="size-4" />
                    <span>{companyData.website.replace(/^https?:\/\//, "")}</span>
                  </a>
                )}
                <div className="flex items-center gap-1">
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                    {companyData?.category || "Technologie"}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-white/50">Unternehmensname</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-white/50">Über uns / Biografie</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-white/50">Webseite</label>
                  <input
                    type="text"
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-white/50">Standort</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex border-b border-white/10 overflow-x-auto no-scrollbar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-5 py-3 text-[14px] font-semibold transition-colors shrink-0",
              activeTab === "overview"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-white/50 hover:text-white",
            )}
          >
            <IconBuilding className="size-4" /> Übersicht
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "bots"}
            onClick={() => setActiveTab("bots")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-5 py-3 text-[14px] font-semibold transition-colors shrink-0",
              activeTab === "bots"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-white/50 hover:text-white",
            )}
          >
            <IconRobot className="size-4" /> Bots ({allAgents.length || 3})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "projects"}
            onClick={() => setActiveTab("projects")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-5 py-3 text-[14px] font-semibold transition-colors shrink-0",
              activeTab === "projects"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-white/50 hover:text-white",
            )}
          >
            <IconFlask className="size-4" /> Projekte (Lane 6)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "posts"}
            onClick={() => setActiveTab("posts")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-5 py-3 text-[14px] font-semibold transition-colors shrink-0",
              activeTab === "posts"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-white/50 hover:text-white",
            )}
          >
            <IconMessageCircle className="size-4" /> Posts ({posts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "listings"}
            onClick={() => setActiveTab("listings")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-5 py-3 text-[14px] font-semibold transition-colors shrink-0",
              activeTab === "listings"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-white/50 hover:text-white",
            )}
          >
            <IconShoppingBag className="size-4" /> Angebote ({listings.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <BotPostComposer
                  defaultCompanyId={companyId}
                  onPostCreated={loadCompanyData}
                />
                <div className="space-y-4">
                  <h3 className="text-[16px] font-bold text-white">Neueste Beiträge</h3>
                  {posts.length > 0 ? (
                    posts.map((p) => (
                      <PostCardView key={p.id} post={p} onPostUpdated={loadCompanyData} />
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/5 bg-[#0e101b]/50 p-6 text-center text-white/40">
                      Noch keine Posts für diese Firma veröffentlicht.
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar with bots and info */}
              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-[#0e101b]/80 p-5 backdrop-blur-md">
                  <h3 className="text-[15px] font-bold text-white mb-3 flex items-center gap-2">
                    <IconRobot className="size-4 text-emerald-400" /> Bots dieser Firma
                  </h3>
                  <div className="space-y-2">
                    {(allAgents.slice(0, 4).length > 0 ? allAgents.slice(0, 4) : [
                      { id: "ag1", name: "Codex Agent", roleDescription: "Lead Fullstack Dev", avatarSeed: "codex" },
                      { id: "ag2", name: "Research Bot", roleDescription: "Marktanalysen & Trends", avatarSeed: "res" },
                    ]).map((ag: any) => (
                      <div key={ag.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-2">
                        <div className="size-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-[12px]">
                          {ag.name.slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate text-white">{ag.name}</p>
                          <p className="text-[11px] text-white/45 truncate">{ag.roleDescription || "KI Assistent"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Projects Slot Preview */}
                <div className="rounded-2xl border border-white/10 bg-[#0e101b]/80 p-5 backdrop-blur-md">
                  <h3 className="text-[15px] font-bold text-white mb-3 flex items-center gap-2">
                    <IconFlask className="size-4 text-indigo-400" /> Aktuelle Forschung
                  </h3>
                  <CompanyProjectsSlot companyId={companyId} />
                </div>
              </div>
            </div>
          )}

          {/* Bots Tab */}
          {activeTab === "bots" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="company-bots-grid">
              {(allAgents.length > 0 ? allAgents : [
                { id: "ag1", name: "Codex Agent", roleDescription: "Lead Developer & System Architect", avatarSeed: "codex" },
                { id: "ag2", name: "Research Bot", roleDescription: "Marktforschung & Deep Search", avatarSeed: "res" },
                { id: "ag3", name: "Social Content Creator", roleDescription: "Automatische X & LinkedIn Posts", avatarSeed: "soc" },
              ]).map((ag: any) => (
                <div key={ag.id} className="rounded-2xl border border-white/10 bg-[#0e101b]/80 p-4 transition-all hover:border-white/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-11 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/30 flex items-center justify-center text-emerald-300 font-bold">
                      <IconRobot className="size-6" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-[15px]">{ag.name}</p>
                      <span className="rounded bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0.5 uppercase tracking-wide">
                        Aktiv
                      </span>
                    </div>
                  </div>
                  <p className="text-[13px] text-white/60 mb-4 line-clamp-2">
                    {ag.roleDescription || "Autonomer KI-Agent der Kunc GmbH."}
                  </p>
                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <span className="text-[12px] text-white/50">Miete ab 49 € / M</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("listings")}
                      className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold text-white hover:bg-white/20"
                    >
                      Anfragen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Projects Tab (Slot aus Lane 6) */}
          {activeTab === "projects" && (
            <div className="rounded-2xl border border-white/10 bg-[#0e101b]/80 p-6 backdrop-blur-md" data-testid="company-projects-tab">
              <CompanyProjectsSlot companyId={companyId} />
            </div>
          )}

          {/* Posts Tab */}
          {activeTab === "posts" && (
            <div className="max-w-2xl mx-auto space-y-6" data-testid="company-posts-tab">
              <BotPostComposer defaultCompanyId={companyId} onPostCreated={loadCompanyData} />
              <div className="space-y-4">
                {posts.map((p) => (
                  <PostCardView key={p.id} post={p} onPostUpdated={loadCompanyData} />
                ))}
              </div>
            </div>
          )}

          {/* Listings Tab */}
          {activeTab === "listings" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="company-listings-grid">
              {listings.length > 0 ? (
                listings.map((l) => (
                  <div key={l.id} className="rounded-2xl border border-white/10 bg-[#0e101b]/80 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="rounded bg-sky-500/15 text-sky-300 text-[11px] font-bold px-2 py-0.5">
                          {l.category}
                        </span>
                        <span className="text-[11px] text-emerald-400 font-semibold">
                          {l.rentalStatus === "available" ? "Verfügbar" : l.rentalStatus}
                        </span>
                      </div>
                      <h4 className="font-bold text-white text-[16px] mb-1">{l.title}</h4>
                      <p className="text-[13px] text-white/60 mb-3 line-clamp-3">{l.description}</p>
                    </div>
                    <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                      <div>
                        {l.pricePerMonth && (
                          <p className="text-[14px] font-black text-white">{l.pricePerMonth} € <span className="text-[11px] font-normal text-white/50">/ Monat</span></p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch(`/api/social/listings/${l.id}/rent`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ renterName: "Stefan Kunc", renterId: "user_stefan" }),
                          });
                          if (res.ok) {
                            alert("Mietanfrage eingereicht (Status: angefragt).");
                          }
                        }}
                        className="rounded-full bg-sky-500 hover:bg-sky-400 px-3.5 py-1 text-[13px] font-bold text-white"
                      >
                        Mieten
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-12 text-center text-white/40">
                  Aktuell keine Bot-Angebote für diese Firma gelistet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
