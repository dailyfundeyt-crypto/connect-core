import React, { useState, useEffect } from "react";
import {
  IconFileText,
  IconShoppingBag,
  IconPlus,
  IconRobot,
  IconCheck,
  IconDownload,
  IconExternalLink,
  IconTag,
  IconArrowLeft,
  IconSearch,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { cn } from "@/lib/utils";
import type { Article, BotListing } from "@connect/contracts";
import { getFlag } from "@/contracts/v06/flags";
import { ArticleEditorOfferForm, ArticleOfferDisplayCard } from "@/v06/social/ArticleEditorOffer";
import type { BotOffer } from "@/v06/social/types";

export function ArticlesAndMarketplaceView({ defaultTab = "articles" }: { defaultTab?: "articles" | "marketplace" }) {
  const [tab, setTab] = useState<"articles" | "marketplace">(defaultTab);
  const [articles, setArticles] = useState<Article[]>([]);
  const [listings, setListings] = useState<BotListing[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  const [isWritingArticle, setIsWritingArticle] = useState(false);
  const [isCreatingListing, setIsCreatingListing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");

  // New Article Form state
  const isSocialV1 = getFlag("socialV1");
  const [artV06Offer, setArtV06Offer] = useState<BotOffer | null>(null);
  const [artTitle, setArtTitle] = useState("");
  const [artSummary, setArtSummary] = useState("");
  const [artContent, setArtContent] = useState("");
  const [artCoverUrl, setArtCoverUrl] = useState("");
  const [artTags, setArtTags] = useState("");
  const [artAttachedBotId, setArtAttachedBotId] = useState("");

  // New Listing Form state
  const [listBotId, setListBotId] = useState("");
  const [listTitle, setListTitle] = useState("");
  const [listDesc, setListDesc] = useState("");
  const [listCategory, setListCategory] = useState("general");
  const [listBuyPrice, setListBuyPrice] = useState("");
  const [listRentPrice, setListRentPrice] = useState("");
  const [listCapabilities, setListCapabilities] = useState("Web-Suche, Python, Analyse");

  const [message, setMessage] = useState<string | null>(null);

  const agentsQuery = useQuery(agentListQueryOptions());
  const allAgents = agentsQuery.data ?? [];

  // Load Data
  const loadData = async () => {
    try {
      const [artRes, listRes] = await Promise.all([
        fetch("/api/social/articles"),
        fetch("/api/social/listings"),
      ]);
      if (artRes.ok) {
        const data = await artRes.json();
        setArticles(data.articles || []);
      }
      if (listRes.ok) {
        const data = await listRes.json();
        setListings(data.listings || []);
      }
    } catch (err) {
      console.error("Failed to load articles and listings", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Publish Article
  const handlePublishArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artTitle.trim() || !artContent.trim()) return;

    try {
      const res = await fetch("/api/social/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: artTitle.trim(),
          summary: artSummary.trim() || undefined,
          content: artContent.trim(),
          coverImageUrl: artCoverUrl.trim() || undefined,
          tags: artTags.split(",").map((t) => t.trim()).filter(Boolean),
          attachedBotId: artV06Offer?.botId || artAttachedBotId || undefined,
          attachedOffer: artV06Offer || undefined,
          authorName: "Stefan Kunc",
          authorId: "user_stefan",
        }),
      });

      if (res.ok) {
        setMessage("Artikel erfolgreich veröffentlicht!");
        setIsWritingArticle(false);
        setArtTitle("");
        setArtSummary("");
        setArtContent("");
        setArtCoverUrl("");
        setArtTags("");
        setArtAttachedBotId("");
        setArtV06Offer(null);
        loadData();
      }
    } catch (err) {
      console.error("Failed to publish article", err);
    }
  };

  // Handle Create Listing
  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listTitle.trim() || !listDesc.trim() || !listBotId) return;

    try {
      // Find selected bot config and sanitize
      const selectedAgent = allAgents.find((a) => a.id === listBotId);
      const rawConfig = selectedAgent ? {
        id: selectedAgent.id,
        name: selectedAgent.name,
        role: selectedAgent.roleDescription,
        avatarSeed: selectedAgent.avatarSeed,
        // Notice: No secrets or tokens are passed
      } : { name: listTitle };

      const res = await fetch("/api/social/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: listBotId,
          title: listTitle.trim(),
          description: listDesc.trim(),
          category: listCategory,
          listingType: listBuyPrice && listRentPrice ? "both" : listBuyPrice ? "sell" : "rent",
          buyPrice: listBuyPrice ? parseFloat(listBuyPrice) : undefined,
          pricePerMonth: listRentPrice ? parseFloat(listRentPrice) : undefined,
          capabilities: listCapabilities.split(",").map((c) => c.trim()).filter(Boolean),
          botConfig: rawConfig,
          ownerId: "user_stefan",
        }),
      });

      if (res.ok) {
        setMessage("Bot-Listing erfolgreich erstellt!");
        setIsCreatingListing(false);
        setListTitle("");
        setListDesc("");
        setListBuyPrice("");
        setListRentPrice("");
        loadData();
      }
    } catch (err) {
      console.error("Failed to create listing", err);
    }
  };

  // Rent Request
  const handleRent = async (listingId: string) => {
    try {
      const res = await fetch(`/api/social/listings/${listingId}/rent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renterId: "user_stefan",
          renterName: "Stefan Kunc",
          durationDays: 30,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Mietanfrage eingereicht (Status: ${data.status}).`);
      }
    } catch (err) {
      console.error("Rent request error", err);
    }
  };

  // Buy Request
  const handleBuy = async (listingId: string) => {
    try {
      const res = await fetch(`/api/social/listings/${listingId}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId: "user_stefan",
          buyerName: "Stefan Kunc",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Kaufanfrage eingereicht (Status: ${data.status}). Konfiguration ohne Secrets bereitgestellt.`);
        // Trigger download of sanitized JSON config
        const blob = new Blob([JSON.stringify(data.cleanConfigExport, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bot-config-${listingId}-clean.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Buy request error", err);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 text-white" data-testid="articles-marketplace-view">
      {/* Notifications */}
      {message && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[14px] text-emerald-300">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-white/60 hover:text-white">✕</button>
        </div>
      )}

      {/* Header Tabs */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setTab("articles"); setSelectedArticle(null); }}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-colors",
              tab === "articles" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "bg-white/5 text-white/60 hover:text-white",
            )}
            data-testid="tab-articles"
          >
            <IconFileText className="size-4" /> Artikel
          </button>
          <button
            type="button"
            onClick={() => { setTab("marketplace"); setSelectedArticle(null); }}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-colors",
              tab === "marketplace" ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" : "bg-white/5 text-white/60 hover:text-white",
            )}
            data-testid="tab-marketplace"
          >
            <IconShoppingBag className="size-4" /> Bot-Marktplatz
          </button>
        </div>

        {tab === "articles" && !isWritingArticle && !selectedArticle && (
          <button
            type="button"
            onClick={() => setIsWritingArticle(true)}
            className="flex items-center gap-1.5 rounded-full bg-white text-black px-4 py-1.5 text-[13px] font-bold shadow hover:bg-white/90"
            data-testid="write-article-button"
          >
            <IconPlus className="size-4" /> Artikel schreiben
          </button>
        )}

        {tab === "marketplace" && !isCreatingListing && (
          <button
            type="button"
            onClick={() => setIsCreatingListing(true)}
            className="flex items-center gap-1.5 rounded-full bg-emerald-500 text-white px-4 py-1.5 text-[13px] font-bold shadow hover:bg-emerald-400"
            data-testid="create-listing-button"
          >
            <IconPlus className="size-4" /> Bot anbieten
          </button>
        )}
      </div>

      {/* ARTICLE WRITER FORM */}
      {isWritingArticle && (
        <form onSubmit={handlePublishArticle} className="space-y-4 rounded-2xl border border-white/10 bg-[#0e101b] p-6 shadow-xl mb-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-lg font-bold">Neuen Artikel verfassen</h3>
            <button type="button" onClick={() => setIsWritingArticle(false)} className="text-white/50 hover:text-white">✕</button>
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Titel</label>
            <input
              type="text"
              required
              value={artTitle}
              onChange={(e) => setArtTitle(e.target.value)}
              placeholder="z.B. Wie autonome KI-Agenten die Unternehmensführung revolutionieren"
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Zusammenfassung (Teaser)</label>
            <input
              type="text"
              value={artSummary}
              onChange={(e) => setArtSummary(e.target.value)}
              placeholder="Kurze Zusammenfassung für die Vorschau..."
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Titelbild URL (optional)</label>
            <input
              type="text"
              value={artCoverUrl}
              onChange={(e) => setArtCoverUrl(e.target.value)}
              placeholder="https://... oder /brand/cover.jpg"
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Tags (kommagetrennt)</label>
            <input
              type="text"
              value={artTags}
              onChange={(e) => setArtTags(e.target.value)}
              placeholder="KI, Automatisierung, Deep Research"
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
            />
          </div>
          {/* Bot-Angebot anhängen (Kauf/Miete) */}
          {isSocialV1 ? (
            <ArticleEditorOfferForm
              enabled={Boolean(artV06Offer)}
              onToggleEnabled={(en) =>
                setArtV06Offer(
                  en
                    ? {
                        botId: allAgents[0]?.id || "",
                        mode: "rent",
                        priceCents: 4900,
                        currency: "EUR",
                        period: "month",
                      }
                    : null
                )
              }
              offer={artV06Offer}
              onChangeOffer={setArtV06Offer}
              availableBots={allAgents.map((ag) => ({ id: ag.id, name: ag.name }))}
            />
          ) : (
            <div>
              <label className="text-[12px] font-medium text-white/50">Bot-Angebot anhängen (Kauf/Miete)</label>
              <select
                value={artAttachedBotId}
                onChange={(e) => setArtAttachedBotId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#121422] px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
              >
                <option value="">Kein Bot-Angebot anhängen</option>
                {allAgents.map((ag) => (
                  <option key={ag.id} value={ag.id}>🤖 {ag.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[12px] font-medium text-white/50">Inhalt (Markdown)</label>
            <textarea
              required
              rows={10}
              value={artContent}
              onChange={(e) => setArtContent(e.target.value)}
              placeholder="Schreibe deinen Artikel in Markdown..."
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-[14px] text-white outline-none focus:border-sky-400 font-mono"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsWritingArticle(false)}
              className="rounded-full border border-white/20 px-4 py-2 text-[13px] font-semibold text-white/70 hover:bg-white/10"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-full bg-sky-500 px-6 py-2 text-[14px] font-bold text-white hover:bg-sky-400"
            >
              Veröffentlichen
            </button>
          </div>
        </form>
      )}

      {/* ARTICLE READER */}
      {selectedArticle && (
        <div className="rounded-2xl border border-white/10 bg-[#0e101b] p-6 shadow-xl mb-6">
          <button
            type="button"
            onClick={() => setSelectedArticle(null)}
            className="mb-4 flex items-center gap-1.5 text-[13px] text-sky-400 hover:underline"
          >
            <IconArrowLeft className="size-4" /> Zurück zu allen Artikeln
          </button>
          {selectedArticle.coverImageUrl && (
            <img src={selectedArticle.coverImageUrl} alt="" className="mb-6 max-h-72 w-full rounded-2xl object-cover" />
          )}
          <h2 className="text-2xl font-black text-white mb-2">{selectedArticle.title}</h2>
          <div className="flex items-center gap-3 text-[12px] text-white/50 mb-6 border-b border-white/10 pb-3">
            <span>Von {selectedArticle.authorName}</span>
            <span>·</span>
            <span>{new Date(selectedArticle.createdAt).toLocaleDateString("de-DE")}</span>
          </div>
          <div className="prose prose-invert max-w-none text-[15px] leading-relaxed text-white/85 whitespace-pre-wrap mb-8">
            {selectedArticle.content}
          </div>

          {/* Attached Bot Offer Card in Article */}
          {selectedArticle.attachedOffer ? (
            <div className="mt-6">
              <ArticleOfferDisplayCard
                offer={selectedArticle.attachedOffer}
                botName={selectedArticle.attachedBot?.title || selectedArticle.attachedOffer.botId}
              />
            </div>
          ) : isSocialV1 && selectedArticle.attachedBot ? (
            <div className="mt-6">
              <ArticleOfferDisplayCard
                offer={{
                  botId: selectedArticle.attachedBot.id,
                  mode: "rent",
                  priceCents: Math.round((selectedArticle.attachedBot.pricePerMonth || 49) * 100),
                  currency: "EUR",
                  period: "month",
                }}
                botName={selectedArticle.attachedBot.title}
              />
            </div>
          ) : (
            selectedArticle.attachedBot && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 mb-2 text-emerald-400 font-bold text-[13px] uppercase tracking-wider">
                  <IconRobot className="size-4" /> In diesem Artikel vorgestellter KI-Agent
                </div>
                <h4 className="text-lg font-bold text-white">{selectedArticle.attachedBot.title}</h4>
                <p className="text-[13px] text-white/70 mb-4">{selectedArticle.attachedBot.description}</p>
                <div className="flex items-center justify-between border-t border-emerald-500/20 pt-3">
                  <span className="text-[13px] font-semibold text-emerald-300">
                    {selectedArticle.attachedBot.pricePerMonth ? `${selectedArticle.attachedBot.pricePerMonth} € / Monat` : "Preis auf Anfrage"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRent(selectedArticle.attachedBot.id)}
                      className="rounded-full bg-emerald-500 px-4 py-1.5 text-[13px] font-bold text-white hover:bg-emerald-400"
                    >
                      Mieten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBuy(selectedArticle.attachedBot.id)}
                      className="rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-bold text-white hover:bg-white/20"
                    >
                      Kaufen (Export)
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* ARTICLES LIST */}
      {tab === "articles" && !isWritingArticle && !selectedArticle && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="articles-list-grid">
          {articles.length > 0 ? (
            articles.map((art) => (
              <div
                key={art.id}
                onClick={() => setSelectedArticle(art)}
                className="group cursor-pointer rounded-2xl border border-white/10 bg-[#0e101b]/80 p-5 transition-all duration-200 hover:border-white/20 hover:bg-[#121422] flex flex-col justify-between"
              >
                <div>
                  {art.coverImageUrl && (
                    <img src={art.coverImageUrl} alt="" className="mb-4 h-40 w-full rounded-xl object-cover" />
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    {art.tags.slice(0, 2).map((t, i) => (
                      <span key={i} className="rounded-full bg-sky-500/10 text-sky-300 text-[11px] px-2.5 py-0.5 font-medium">
                        #{t}
                      </span>
                    ))}
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition-colors line-clamp-2">
                    {art.title}
                  </h3>
                  <p className="mt-2 text-[13px] text-white/60 line-clamp-3">
                    {art.summary || art.content.slice(0, 140)}...
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[12px] text-white/40">
                  <span>{(art as any).authorName || "Stefan Kunc"}</span>
                  <span className="text-sky-400 font-semibold group-hover:underline">Lesen →</span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-white/40">
              Noch keine Artikel verfasst. Klicke auf "Artikel schreiben", um den ersten Artikel zu erstellen.
            </div>
          )}
        </div>
      )}

      {/* CREATE BOT LISTING FORM */}
      {isCreatingListing && (
        <form onSubmit={handleCreateListing} className="space-y-4 rounded-2xl border border-white/10 bg-[#0e101b] p-6 shadow-xl mb-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-lg font-bold">Bot auf Marktplatz anbieten</h3>
            <button type="button" onClick={() => setIsCreatingListing(false)} className="text-white/50 hover:text-white">✕</button>
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Bot auswählen</label>
            <select
              required
              value={listBotId}
              onChange={(e) => {
                setListBotId(e.target.value);
                const ag = allAgents.find((a) => a.id === e.target.value);
                if (ag) {
                  setListTitle(ag.name);
                  setListDesc(ag.roleDescription || "");
                }
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-[#121422] px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
            >
              <option value="">Wähle einen deiner Bots...</option>
              {allAgents.map((ag) => (
                <option key={ag.id} value={ag.id}>{ag.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Angebotstitel</label>
            <input
              type="text"
              required
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Beschreibung & Leistungsumfang</label>
            <textarea
              required
              rows={3}
              value={listDesc}
              onChange={(e) => setListDesc(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 p-3 text-[14px] text-white outline-none focus:border-sky-400"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[12px] font-medium text-white/50">Kategorie</label>
              <select
                value={listCategory}
                onChange={(e) => setListCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#121422] px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
              >
                <option value="general">Allgemein</option>
                <option value="coding">Entwicklung & Code</option>
                <option value="research">Research & Analyse</option>
                <option value="marketing">Marketing & Social</option>
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-white/50">Mietpreis (€ / Monat)</label>
              <input
                type="number"
                value={listRentPrice}
                onChange={(e) => setListRentPrice(e.target.value)}
                placeholder="z.B. 49"
                className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-white/50">Kaufpreis (€ für Export)</label>
              <input
                type="number"
                value={listBuyPrice}
                onChange={(e) => setListBuyPrice(e.target.value)}
                placeholder="z.B. 299"
                className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-white/50">Fähigkeiten (Capabilities)</label>
            <input
              type="text"
              value={listCapabilities}
              onChange={(e) => setListCapabilities(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[14px] text-white outline-none focus:border-sky-400"
            />
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[12px] text-amber-300">
            🔒 <strong>Sicherer Export:</strong> Beim Verkauf oder bei Miete werden automatisch alle sensiblen API-Schlüssel, Passwörter und Zugangsdaten aus der Konfiguration entfernt.
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreatingListing(false)}
              className="rounded-full border border-white/20 px-4 py-2 text-[13px] font-semibold text-white/70 hover:bg-white/10"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-full bg-emerald-500 px-6 py-2 text-[14px] font-bold text-white hover:bg-emerald-400"
            >
              Listing veröffentlichen
            </button>
          </div>
        </form>
      )}

      {/* MARKETPLACE GRID */}
      {tab === "marketplace" && !isCreatingListing && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="marketplace-grid">
            {listings.length > 0 ? (
              listings.map((l) => (
                <div key={l.id} className="rounded-2xl border border-white/10 bg-[#0e101b]/90 p-5 shadow-lg flex flex-col justify-between hover:border-white/20 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="rounded-full bg-sky-500/10 text-sky-400 px-2.5 py-0.5 text-[11px] font-bold">
                        {l.category}
                      </span>
                      <span className="text-[12px] text-emerald-400 font-semibold">
                        {l.rentalStatus === "available" ? "Verfügbar" : l.rentalStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <IconRobot className="size-5 text-emerald-400" />
                      <h3 className="text-base font-bold text-white">{l.title}</h3>
                    </div>
                    <p className="text-[13px] text-white/65 line-clamp-3 mb-4">{l.description}</p>
                    {l.capabilities && l.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {l.capabilities.map((c, i) => (
                          <span key={i} className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      {l.pricePerMonth && (
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Miete</p>
                          <p className="text-[15px] font-black text-white">{l.pricePerMonth} € <span className="text-[10px] font-normal text-white/50">/ M</span></p>
                        </div>
                      )}
                      {(l as any).buyPrice && (
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Kauf (Export)</p>
                          <p className="text-[15px] font-black text-emerald-400">{(l as any).buyPrice} €</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {l.pricePerMonth && (
                        <button
                          type="button"
                          onClick={() => handleRent(l.id)}
                          className="flex-1 rounded-full bg-sky-500 hover:bg-sky-400 py-1.5 text-[13px] font-bold text-white transition-colors"
                        >
                          Mieten
                        </button>
                      )}
                      {(l as any).buyPrice && (
                        <button
                          type="button"
                          onClick={() => handleBuy(l.id)}
                          className="flex-1 rounded-full bg-white/10 hover:bg-white/20 py-1.5 text-[13px] font-bold text-white transition-colors"
                        >
                          Kaufen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-white/40">
                Aktuell sind keine Bot-Listings auf dem Marktplatz vorhanden. Klicke auf "Bot anbieten", um das erste Listing zu erstellen.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
