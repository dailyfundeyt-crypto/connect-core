import {
  IconBriefcase,
  IconCalendar,
  IconCamera,
  IconLink,
  IconMapPin,
  IconMessage,
  IconPencil,
  IconPinned,
  IconPlus,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fileToAvatarDataUrl } from "@/lib/agents/connect-avatars";
import type { ConnectCompany } from "@/lib/companies/catalog";
import {
  connectionGraph,
  createConnection,
  listConnections,
  subscribeConnections,
  type CompanyConnection,
} from "@/lib/companies/connections";
import {
  createPost,
  deletePost,
  ensureSeedPosts,
  listPosts,
  pinPost,
  subscribePosts,
  unpinPost,
  type CompanyPost,
} from "@/lib/companies/posts";
import {
  companyHandle,
  formatCompanyHandle,
  getCompany,
  listCompanies,
  subscribeCompanies,
  updateCompany,
} from "@/lib/companies/store";
import {
  countCompanyEmployees,
  ensureSeedProjects,
  listProjects,
  subscribeProjects,
} from "@/lib/companies/projects";
import { cn } from "@/lib/utils";
import { BlueCheckBadge } from "@/components/companies/blue-check-badge";
import { CompanyMarketplaceStrip } from "@/components/marketplace/company-marketplace-strip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  hasBlueCheck,
  subscribeBlueCheck,
} from "@/lib/donations/blue-check";
import { useLocale } from "@/lib/i18n/use-locale";

type Tab = "posts" | "connections";

/**
 * X-style company profile:
 * banner + logo, employees, connections, posts. Profile fields are editable.
 */
export function CompanyProfileX({
  company: companyProp,
  employeeCount: employeeCountProp,
  projectsSlot,
}: {
  company: ConnectCompany;
  /** Fallback while the company roster has not hydrated; live count prefers company.agentIds. */
  employeeCount?: number;
  projectsSlot?: ReactNode;
}) {
  const [company, setCompany] = useState(companyProp);
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<CompanyPost[]>([]);
  const [connections, setConnections] = useState<CompanyConnection[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: companyProp.name,
    handle: companyHandle(companyProp),
    description: companyProp.description,
    category: companyProp.category ?? "",
    location: companyProp.location ?? "",
    website: companyProp.website ?? "",
    logo: companyProp.logo ?? "",
    banner: companyProp.banner ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [rosterTick, setRosterTick] = useState(0);
  const [donor, setDonor] = useState(() => hasBlueCheck());
  const bannerRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCompany(companyProp);
  }, [companyProp]);

  useEffect(() => {
    return subscribeCompanies(() => {
      const next = getCompany(companyProp.id);
      if (next) setCompany(next);
    });
  }, [companyProp.id]);

  useEffect(() => subscribeBlueCheck(() => setDonor(hasBlueCheck())), []);

  useEffect(() => {
    ensureSeedProjects(companyProp.id, companyProp.agentIds ?? []);
    return subscribeProjects(() => setRosterTick((n) => n + 1));
  }, [companyProp.id, companyProp.agentIds]);

  useEffect(() => {
    ensureSeedPosts(company.id, company.name, company.agentIds ?? []);
    const refresh = () => {
      setPosts(listPosts(company.id));
      setConnections(listConnections(company.id));
    };
    refresh();
    const offPosts = subscribePosts(refresh);
    const offConn = subscribeConnections(refresh);
    return () => {
      offPosts();
      offConn();
    };
  }, [company.id, company.name, company.agentIds]);

  /** Unique peer companies this company is linked to (Following). */
  const followingCount = useMemo(() => {
    const peers = new Set<string>();
    for (const edge of connections) {
      peers.add(edge.fromId === company.id ? edge.toId : edge.fromId);
    }
    return peers.size;
  }, [connections, company.id]);

  /** Product-linked edges (Connections) — can be several per peer. */
  const connectionCount = connections.length;

  /** Roster size: unique agents across company + every team folder. */
  const employeeCount = useMemo(() => {
    void rosterTick;
    return countCompanyEmployees(company.id, company.agentIds ?? []);
  }, [company.id, company.agentIds, rosterTick, employeeCountProp]);

  const pinned = posts.find((p) => p.pinned);
  const feed = posts.filter((p) => !p.pinned);

  /** Custom banner only — default is a plain white header behind the logo. */
  const bannerSrc = editing ? draft.banner : company.banner;
  const showBannerImage = Boolean(
    bannerSrc &&
      !bannerSrc.includes("_banner-template") &&
      !/\/companies\/[\w-]+-banner\.png/.test(bannerSrc),
  );
  const logo =
    (editing ? draft.logo : company.logo) || "/companies/_logo-template.png?v=5";
  const handleDisplay = formatCompanyHandle(
    editing ? draft.handle : companyHandle(company),
  );

  const startEdit = () => {
    setDraft({
      name: company.name,
      handle: companyHandle(company),
      description: company.description,
      category: company.category ?? "",
      location: company.location ?? "",
      website: company.website ?? "",
      logo: company.logo ?? "",
      banner: company.banner ?? "",
    });
    setError(null);
    setEditing(true);
  };

  const saveEdit = () => {
    setError(null);
    try {
      const saved = updateCompany(company.id, {
        name: draft.name,
        handle: draft.handle,
        description: draft.description,
        category: draft.category || null,
        location: draft.location || null,
        website: draft.website || null,
        logo: draft.logo || null,
        banner: draft.banner || null,
      });
      setCompany(saved);
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Speichern fehlgeschlagen.",
      );
    }
  };

  const onPickImage = (file: File | undefined, kind: "logo" | "banner") => {
    if (!file) return;
    void fileToAvatarDataUrl(file)
      .then((dataUrl) => {
        if (editing) {
          setDraft((d) => ({ ...d, [kind]: dataUrl }));
          setError(null);
          return;
        }
        try {
          const saved = updateCompany(company.id, {
            [kind]: dataUrl,
          });
          setCompany(saved);
          setError(null);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Bild konnte nicht gespeichert werden.",
          );
        }
      })
      .catch((caught) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Bild konnte nicht gelesen werden.",
        );
      });
  };

  return (
    <div className="mx-auto w-full max-w-2xl bg-[#ffffff] text-foreground">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 bg-[#ffffff] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold tracking-tight">
            {company.name}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {posts.length} posts · Company profile
          </p>
        </div>
      </div>

      <div className="group/banner relative h-36 w-full overflow-hidden bg-[#ffffff] sm:h-44">
        {showBannerImage ? (
          <img
            alt=""
            className="size-full object-cover object-center [image-rendering:auto]"
            decoding="async"
            src={bannerSrc}
          />
        ) : (
          <div aria-hidden className="size-full bg-[#ffffff]" />
        )}
        <button
          aria-label="Banner ändern"
          className={cn(
            "absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold transition",
            showBannerImage ? "text-white" : "text-foreground",
            editing
              ? showBannerImage
                ? "bg-black/35 hover:bg-black/45"
                : "bg-foreground/5 hover:bg-foreground/10"
              : showBannerImage
                ? "bg-black/0 opacity-0 hover:bg-black/40 hover:opacity-100 focus-visible:bg-black/40 focus-visible:opacity-100 group-hover/banner:bg-black/35 group-hover/banner:opacity-100"
                : "bg-transparent opacity-0 hover:bg-foreground/5 hover:opacity-100 focus-visible:bg-foreground/5 focus-visible:opacity-100 group-hover/banner:bg-foreground/5 group-hover/banner:opacity-100",
          )}
          onClick={() => bannerRef.current?.click()}
          type="button"
        >
          <IconCamera className="size-4" />
          Banner ändern
        </button>
        <input
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onPickImage(e.target.files?.[0], "banner");
            e.target.value = "";
          }}
          ref={bannerRef}
          type="file"
        />
      </div>

      <div className="px-4">
        <div className="relative flex items-end justify-between">
          <div className="group/logo relative -mt-14 size-[88px] overflow-hidden rounded-2xl border-4 border-[#ffffff] bg-black shadow-[0_0_0_1px_rgba(0,0,0,0.04)] sm:-mt-16 sm:size-[108px]">
            <img
              alt=""
              className="size-full object-cover [image-rendering:auto]"
              decoding="async"
              src={logo}
            />
            <button
              aria-label="Logo ändern"
              className={cn(
                "absolute inset-0 flex items-center justify-center text-white transition",
                editing
                  ? "bg-black/40"
                  : "bg-black/0 opacity-0 hover:bg-black/45 hover:opacity-100 focus-visible:bg-black/45 focus-visible:opacity-100 group-hover/logo:bg-black/40 group-hover/logo:opacity-100",
              )}
              onClick={() => logoRef.current?.click()}
              type="button"
            >
              <IconCamera className="size-5" />
            </button>
            <input
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPickImage(e.target.files?.[0], "logo");
                e.target.value = "";
              }}
              ref={logoRef}
              type="file"
            />
          </div>
          <div className="mb-1 flex items-center gap-2">
            {editing ? (
              <>
                <Button
                  onClick={() => setEditing(false)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Abbrechen
                </Button>
                <Button
                  className="h-9 rounded-full px-4 text-sm font-bold"
                  onClick={saveEdit}
                  size="sm"
                  type="button"
                >
                  Speichern
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="h-9 gap-1.5 rounded-full px-3 text-sm"
                  onClick={startEdit}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <IconPencil className="size-3.5" />
                  Profil bearbeiten
                </Button>
                <button
                  aria-label="More"
                  className="flex size-9 items-center justify-center rounded-full border border-border text-lg leading-none hover:bg-foreground/5"
                  type="button"
                >
                  ···
                </button>
                <Link
                  aria-label="Message"
                  className="flex size-9 items-center justify-center rounded-full border border-border hover:bg-foreground/5"
                  params={{ companyId: company.id }}
                  search={{ level: 3 }}
                  to="/company/$companyId"
                >
                  <IconMessage className="size-4" />
                </Link>
                <Button
                  className="h-9 rounded-full px-4 text-sm font-bold"
                  size="sm"
                >
                  Following
                </Button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-3 space-y-2">
            <Input
              aria-label="Company name"
              className="text-xl font-extrabold"
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              value={draft.name}
            />
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">@co/</span>
              <Input
                aria-label="Handle"
                className="font-mono text-sm"
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    handle: e.target.value.replace(/^@?co\/?/i, ""),
                  }))
                }
                placeholder="handle"
                value={draft.handle}
              />
            </div>
            <Textarea
              aria-label="Description"
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              rows={3}
              value={draft.description}
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Category"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, category: e.target.value }))
                }
                placeholder="Kategorie (z. B. Marketing)"
                value={draft.category}
              />
              <Input
                aria-label="Location"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, location: e.target.value }))
                }
                placeholder="Ort (z. B. Remote)"
                value={draft.location}
              />
              <Input
                aria-label="Website"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, website: e.target.value }))
                }
                placeholder="Website (z. B. nordwind.local)"
                value={draft.website}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 space-y-1">
            {error ? (
              <p className="mb-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-extrabold tracking-tight">
                {company.name}
              </h2>
              <BlueCheckBadge active={donor} />
            </div>
            <p className="font-mono text-[15px] text-muted-foreground">
              {handleDisplay}
            </p>
            <p className="pt-1 text-[15px] leading-snug text-foreground/95">
              {company.description}
            </p>
          </div>
        )}

        {!editing ? (
          <button
            className="group/meta mt-3 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg text-left text-[13px] text-muted-foreground transition hover:bg-foreground/[0.03]"
            onClick={startEdit}
            title="Kategorie, Ort und Website bearbeiten"
            type="button"
          >
            {company.category ? (
              <span className="inline-flex items-center gap-1">
                <IconBriefcase className="size-3.5" />
                {company.category}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground/55">
                <IconBriefcase className="size-3.5" />
                + Kategorie
              </span>
            )}
            {company.location ? (
              <span className="inline-flex items-center gap-1">
                <IconMapPin className="size-3.5" />
                {company.location}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground/55">
                <IconMapPin className="size-3.5" />
                + Ort
              </span>
            )}
            {company.website ? (
              <span className="inline-flex items-center gap-1 text-sky-600">
                <IconLink className="size-3.5" />
                {company.website}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sky-600/55">
                <IconLink className="size-3.5" />
                + Website
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <IconCalendar className="size-3.5" />
              Joined Connect
            </span>
            <span className="ml-auto hidden items-center gap-1 text-[11px] font-medium text-muted-foreground group-hover/meta:inline-flex">
              <IconPencil className="size-3" />
              Bearbeiten
            </span>
          </button>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-4 text-[14px]">
          <button
            className="hover:underline"
            onClick={() => setTab("connections")}
            title="Unique companies this company follows"
            type="button"
          >
            <strong className="font-bold">{followingCount}</strong>{" "}
            <span className="text-muted-foreground">Following</span>
          </button>
          <span title="Agents on this company roster">
            <strong className="font-bold">{employeeCount}</strong>{" "}
            <span className="text-muted-foreground">Employees</span>
          </span>
          <button
            className="hover:underline"
            onClick={() => setTab("connections")}
            title="Product links between companies"
            type="button"
          >
            <strong className="font-bold">{connectionCount}</strong>{" "}
            <span className="text-muted-foreground">Connections</span>
          </button>
        </div>

        {projectsSlot ? <div className="mt-1">{projectsSlot}</div> : null}

        <CompanyMarketplaceStrip companyId={company.id} />
      </div>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-border text-[15px] font-semibold">
        {(
          [
            ["posts", "Posts"],
            ["connections", "Connections"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={cn(
              "relative flex-1 py-3.5 transition-colors",
              tab === id
                ? "text-foreground after:absolute after:inset-x-10 after:bottom-0 after:h-1 after:rounded-full after:bg-sky-500"
                : "text-muted-foreground hover:bg-foreground/[0.03]",
            )}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "posts" ? (
        <PostsTab
          agentIds={company.agentIds ?? []}
          companyId={company.id}
          companyName={company.name}
          feed={feed}
          logo={logo}
          onChanged={() => setPosts(listPosts(company.id))}
          pinned={pinned}
        />
      ) : null}
      {tab === "connections" ? (
        <ConnectionsTab
          companyId={company.id}
          connections={connections}
          onChanged={() => setConnections(listConnections(company.id))}
        />
      ) : null}
    </div>
  );
}

function PostsTab({
  companyId,
  companyName,
  agentIds,
  pinned,
  feed,
  logo,
  onChanged,
}: {
  companyId: string;
  companyName: string;
  agentIds: string[];
  pinned?: CompanyPost;
  feed: CompanyPost[];
  logo: string;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<
    "all" | "public" | "private" | "inbox"
  >("all");
  const [kind, setKind] = useState<"task" | "chat" | "update">("update");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignTo, setAssignTo] = useState(agentIds[0] ?? "");
  const [pinAsGoal, setPinAsGoal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { t } = useLocale();

  useEffect(() => {
    if (!assignTo && agentIds[0]) setAssignTo(agentIds[0]);
  }, [agentIds, assignTo]);

  const inboxId =
    agentIds.includes("spark")
      ? "spark"
      : (agentIds.find((id) => id !== "cto") ?? agentIds[0] ?? "");

  const visibleFeed = feed.filter((post) => {
    if (filter === "public") return post.visibility !== "private";
    if (filter === "private") return post.visibility === "private";
    if (filter === "inbox")
      return post.source === "slack" || post.source === "linear";
    return true;
  });

  const pretty = (id: string) =>
    id ? id.charAt(0).toUpperCase() + id.slice(1) : "Bot";

  return (
    <div>
      {pinned ? (
        <article className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
              <IconPinned className="size-3.5" />
              Pinned
            </p>
            <button
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => {
                unpinPost(companyId, pinned.id);
                onChanged();
              }}
              type="button"
            >
              {t("unpin")}
            </button>
          </div>
          <PostBody
            companyId={companyId}
            logo={logo}
            onChanged={onChanged}
            post={pinned}
          />
        </article>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
        {(
          [
            ["all", "Alle"],
            ["public", "Mitarbeiter"],
            ["private", "Privat"],
            ["inbox", "Slack / Linear"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold",
              filter === id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            key={id}
            onClick={() => setFilter(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="space-y-2 border-b border-border px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFormError(null);
          if (!title.trim() || !body.trim()) {
            setFormError("Titel und Text sind nötig.");
            return;
          }
          try {
            const assignee = assignTo || agentIds[0];
            const asInbox = kind === "task" || kind === "chat";
            createPost({
              companyId,
              kind,
              title,
              body,
              authorName: asInbox && inboxId ? pretty(inboxId) : companyName,
              visibility,
              pinned: pinAsGoal,
              source:
                kind === "task"
                  ? "linear"
                  : kind === "chat"
                    ? "slack"
                    : "manual",
              ...(asInbox && inboxId
                ? {
                    inboxBotId: inboxId,
                    inboxBotName: pretty(inboxId),
                    assignedToId: assignee,
                    assignedToName: pretty(assignee),
                    externalFrom:
                      kind === "task"
                        ? "Linear · new issue"
                        : "Slack · conversation",
                  }
                : {}),
            });
            setTitle("");
            setBody("");
            setPinAsGoal(false);
            onChanged();
          } catch (caught) {
            setFormError(
              caught instanceof Error ? caught.message : "Post fehlgeschlagen.",
            );
          }
        }}
      >
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["update", "Post"],
              ["chat", "Slack"],
              ["task", "Linear"],
            ] as const
          ).map(([id, label]) => (
            <button
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                kind === id
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground",
              )}
              key={id}
              onClick={() => setKind(id)}
              type="button"
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px self-center bg-border" />
          <button
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              visibility === "public"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
            onClick={() => setVisibility("public")}
            type="button"
          >
            Für Mitarbeiter
          </button>
          <button
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              visibility === "private"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
            onClick={() => setVisibility("private")}
            type="button"
          >
            Privat
          </button>
          <button
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              pinAsGoal
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
            onClick={() => setPinAsGoal((v) => !v)}
            type="button"
          >
            {t("pin")}
          </button>
        </div>
        {(kind === "task" || kind === "chat") && agentIds.length > 0 ? (
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            Zuweisen an
            <select
              className="h-8 rounded-lg border border-border bg-white px-2 text-xs text-foreground"
              onChange={(e) => setAssignTo(e.target.value)}
              value={assignTo}
            >
              {agentIds.map((id) => (
                <option key={id} value={id}>
                  {pretty(id)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <input
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground/30"
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === "task"
              ? "Linear issue title…"
              : kind === "chat"
                ? "Slack thread / message…"
                : "Post title…"
          }
          value={title}
        />
        <textarea
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground/30"
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            visibility === "private"
              ? "Private note…"
              : "Message for employees…"
          }
          rows={2}
          value={body}
        />
        {formError ? (
          <p className="text-xs text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button className="rounded-full" size="sm" type="submit">
            {t("post")}
          </Button>
        </div>
      </form>

      <ul>
        {visibleFeed.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            Keine Posts in diesem Filter.
          </li>
        ) : (
          visibleFeed.map((post) => (
            <li className="border-b border-border px-4 py-3" key={post.id}>
              <PostBody
                companyId={companyId}
                logo={logo}
                onChanged={onChanged}
                post={post}
              />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function PostBody({
  post,
  logo,
  companyId,
  onChanged,
}: {
  post: CompanyPost;
  logo: string;
  companyId: string;
  onChanged: () => void;
}) {
  const { t } = useLocale();
  const sourceLabel =
    post.source === "linear"
      ? "Linear"
      : post.source === "slack"
        ? "Slack"
        : post.kind === "goal"
          ? "Goal"
          : "Post";
  const appLogo =
    post.source === "linear"
      ? "/apps/linear.png"
      : post.source === "slack"
        ? "/apps/slack.png"
        : logo;

  return (
    <div className="flex gap-3">
      <img
        alt=""
        className="size-10 shrink-0 rounded-xl object-cover [image-rendering:auto]"
        decoding="async"
        src={appLogo}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
          <span className="font-bold text-[15px]">{post.authorName}</span>
          <span className="text-muted-foreground">· {sourceLabel}</span>
          {post.visibility === "private" ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Privat
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Mitarbeiter
            </span>
          )}
          <span className="ml-auto flex gap-2">
            <button
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (post.pinned) unpinPost(companyId, post.id);
                else pinPost(companyId, post.id);
                onChanged();
              }}
              type="button"
            >
              {post.pinned ? t("unpin") : t("pin")}
            </button>
            <button
              className="text-[11px] font-semibold text-muted-foreground hover:text-destructive"
              onClick={() => {
                deletePost(post.id);
                onChanged();
              }}
              type="button"
            >
              ×
            </button>
          </span>
        </div>
        {post.externalFrom ? (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Von {post.externalFrom}
            {post.inboxBotName ? (
              <>
                {" "}
                → <strong className="text-foreground">{post.inboxBotName}</strong>
              </>
            ) : null}
            {post.assignedToName ? (
              <>
                {" "}
                → Arbeiter{" "}
                <strong className="text-foreground">{post.assignedToName}</strong>
              </>
            ) : null}
          </p>
        ) : post.assignedToName ? (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Zugewiesen an{" "}
            <strong className="text-foreground">{post.assignedToName}</strong>
          </p>
        ) : null}
        <p className="mt-0.5 font-semibold leading-snug">{post.title}</p>
        <p className="mt-0.5 text-[15px] leading-snug text-foreground/90">
          {post.body}
        </p>
      </div>
    </div>
  );
}

function ConnectionsTab({
  companyId,
  connections,
  onChanged,
}: {
  companyId: string;
  connections: CompanyConnection[];
  onChanged: () => void;
}) {
  const others = useMemo(
    () => listCompanies().filter((c) => c.id !== companyId),
    [companyId],
  );
  const [toId, setToId] = useState(others[0]?.id ?? "");
  const [product, setProduct] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="px-4 py-4">
      <ConnectionGraph companyId={companyId} />

      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-3 text-sm text-muted-foreground">
          Following other companies requires naming the{" "}
          <strong className="text-foreground">product</strong> that creates the
          link — otherwise the cross-company graph cannot be read.
        </p>
        <form
          className="mb-5 space-y-2 rounded-2xl border border-border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            try {
              createConnection({ fromId: companyId, toId, product });
              setProduct("");
              onChanged();
            } catch (thrown) {
              setError(thrown instanceof Error ? thrown.message : "Failed");
            }
          }}
        >
          <label className="block text-xs font-semibold text-muted-foreground">
            Company
            <select
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
              onChange={(e) => setToId(e.target.value)}
              value={toId}
            >
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            Product (required)
            <input
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-foreground/30"
              onChange={(e) => setProduct(e.target.value)}
              placeholder="e.g. Connect Analytics API"
              required
              value={product}
            />
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="gap-1 rounded-full" size="sm" type="submit">
            <IconPlus className="size-4" />
            Connect
          </Button>
        </form>

        <ul className="divide-y divide-border">
          {connections.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">
              No connections yet.
            </li>
          ) : (
            connections.map((c) => {
              const otherId = c.fromId === companyId ? c.toId : c.fromId;
              const other =
                listCompanies().find((co) => co.id === otherId)?.name ??
                otherId;
              return (
                <li className="flex items-start gap-3 py-3" key={c.id}>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted text-xs font-bold">
                    {other.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{other}</p>
                    <p className="text-sm text-muted-foreground">
                      Product:{" "}
                      <span className="font-medium text-foreground">
                        {c.product}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

function ConnectionGraph({ companyId }: { companyId: string }) {
  const companies = listCompanies();
  const { edges } = connectionGraph(companies.map((c) => c.id));
  const width = 520;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    companies.forEach((c, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(companies.length, 1) - Math.PI / 2;
      map.set(c.id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    });
    return map;
  }, [companies, cx, cy, radius]);

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        All companies — edges only exist when a product was named on the
        connection.
      </p>
      <svg
        aria-label="Company connection graph"
        className="w-full rounded-2xl border border-black/5 bg-[#ffffff]"
        viewBox={`0 0 ${width} ${height}`}
      >
        {edges.map((e) => {
          const a = positions.get(e.fromId);
          const b = positions.get(e.toId);
          if (!a || !b) return null;
          const active =
            e.fromId === companyId || e.toId === companyId;
          return (
            <g key={e.id}>
              <line
                stroke={active ? "#0ea5e9" : "#cbd5e1"}
                strokeWidth={active ? 2.5 : 1.5}
                x1={a.x}
                x2={b.x}
                y1={a.y}
                y2={b.y}
              />
              <text
                fill="#64748b"
                fontSize="10"
                textAnchor="middle"
                x={(a.x + b.x) / 2}
                y={(a.y + b.y) / 2 - 6}
              >
                {e.product}
              </text>
            </g>
          );
        })}
        {companies.map((c) => {
          const p = positions.get(c.id);
          if (!p) return null;
          const active = c.id === companyId;
          return (
            <g key={c.id}>
              <circle
                cx={p.x}
                cy={p.y}
                fill={active ? "#0f172a" : "#fff"}
                r={22}
                stroke={active ? "#0ea5e9" : "#94a3b8"}
                strokeWidth={2}
              />
              <text
                fill={active ? "#fff" : "#0f172a"}
                fontSize="11"
                fontWeight="700"
                textAnchor="middle"
                x={p.x}
                y={p.y + 4}
              >
                {c.name.slice(0, 2).toUpperCase()}
              </text>
              <text
                fill="#475569"
                fontSize="11"
                textAnchor="middle"
                x={p.x}
                y={p.y + 38}
              >
                {c.name}
              </text>
            </g>
          );
        })}
      </svg>
      {edges.length === 0 ? (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Add connections with a product to see edges here.
        </p>
      ) : null}
    </div>
  );
}
