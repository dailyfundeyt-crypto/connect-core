import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { IconChevronRight, IconPlus } from "@tabler/icons-react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { CompanyProfileX } from "@/components/companies/company-profile-x";
import { CompanySiteStudio } from "@/components/companies/company-site-studio";
import { CompanyStockTile } from "@/components/companies/company-stock-tile";
import { Level3SiteStudio } from "@/components/companies/level3-site-studio";
import { ProjectProfileX } from "@/components/companies/project-profile-x";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  type AgentProfile,
  agentListQueryOptions,
} from "@/lib/agents/queries";
import {
  APP_CATALOG,
  type AppKey,
  createProject,
  ensureSeedProjects,
  getApp,
  listProjects,
  subscribeProjects,
  type ConnectProject,
} from "@/lib/companies/projects";
import { getCompany } from "@/lib/companies/store";
import {
  type CompanyLevel,
  getActiveLevel,
  subscribeLevel,
} from "@/lib/companies/level";

const searchSchema = z.object({
  agent: z.string().optional().catch(undefined),
  /**
   * 1 = Focus overlay
   * 2 = Messages (HQ)
   * 3 = Browser (Lab)
   * 4 = Unternehmen (static site)
   */
  level: z.coerce.number().int().min(1).max(4).catch(2).default(2),
  project: z.string().optional().catch(undefined),
  profile: z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional()
    .catch(undefined)
    .transform((v) => v === true || v === "true"),
});

export const Route = createFileRoute("/_authed/_app/company/$companyId")({
  validateSearch: searchSchema,
  component: CompanyWorkspace,
});

function CompanyWorkspace() {
  const { companyId } = Route.useParams();
  const {
    project: projectId,
    agent: agentId,
    profile,
  } = Route.useSearch();
  const navigate = useNavigate();
  const company = getCompany(companyId);
  const [mode, setMode] = useState<CompanyLevel>(() => getActiveLevel());

  useEffect(() => subscribeLevel(() => setMode(getActiveLevel())), []);

  const level: CompanyLevel =
    mode === 3 || mode === 4 || mode === 1 ? mode : 2;

  const agentsQuery = useQuery(agentListQueryOptions());
  const companyAgents = useMemo(() => {
    if (!company || !agentsQuery.data) return [];
    return company.agentIds
      .map((id) => agentsQuery.data.find((a) => a.id === id))
      .filter((a): a is AgentProfile => Boolean(a));
  }, [company, agentsQuery.data]);

  useEffect(() => {
    if (!company || companyAgents.length === 0) return;
    ensureSeedProjects(
      company.id,
      companyAgents.map((a) => a.id),
    );
  }, [company, companyAgents]);

  useEffect(() => {
    if (level !== 2) return;
    if (profile || projectId) return;
    void navigate({ to: "/", replace: true });
  }, [level, profile, projectId, navigate]);

  if (!company) {
    return (
      <>
        <SidebarToggleBar />
        <Empty className="m-8 border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Company not found</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  if (level === 2 && !profile && !projectId) {
    return null;
  }

  return (
    <>
      {/* Lab + Unternehmen: no top toggle / URL chrome — full content. */}
      {level === 3 || level === 4 ? null : <SidebarToggleBar />}
      {level === 3 ? (
        <Level3AgentFocus
          agentId={agentId}
          agents={companyAgents}
          companyId={company.id}
          companyName={company.name}
          highlightProjectId={projectId}
          level={level}
        />
      ) : level === 4 ? (
        <CompanySiteStudio
          companyId={company.id}
          companyName={company.name}
        />
      ) : (
        <Level2CompanyOverview
          agents={companyAgents}
          company={company}
          level={level === 1 ? 2 : level}
          projectId={projectId}
        />
      )}
    </>
  );
}

function LevelPlaceholder({
  companyId,
  level,
  name,
  subtitle,
  body,
}: {
  companyId: string;
  level: 1 | 3;
  name: string;
  subtitle: string;
  body: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#ffffff] text-foreground">
      <header className="flex items-center gap-3 border-b border-black/5 px-5 py-4">
        <CompanyMark companyId={companyId} name={name} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {name}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center bg-[#ffffff] px-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

function Level2CompanyOverview({
  company,
  level,
  agents,
  projectId,
}: {
  company: NonNullable<ReturnType<typeof getCompany>>;
  level: number;
  agents: AgentProfile[];
  projectId?: string;
}) {
  const openProject = projectId
    ? listProjects(company.id).find((p) => p.id === projectId)
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#ffffff] text-foreground">
      {openProject ? (
        <ProjectProfileX
          agents={agents}
          companyId={company.id}
          companyName={company.name}
          project={openProject}
        />
      ) : (
        <CompanyProfileX
          company={company}
          employeeCount={company.agentIds.length}
          projectsSlot={
            <CompanyProjectsRich agents={agents} companyId={company.id} />
          }
        />
      )}
    </div>
  );
}

/**
 * Level 3 — isolated company site on Connect (private files + builder chat).
 * Does not merge with Connect product code; preview is sandboxed.
 */
function Level3AgentFocus({
  companyId,
  companyName,
  agents,
  agentId,
}: {
  companyId: string;
  companyName: string;
  agents: AgentProfile[];
  level: number;
  highlightProjectId?: string;
  agentId?: string;
}) {
  const computerId =
    agentId && agents.some((a) => a.id === agentId)
      ? agentId
      : (agents[0]?.id ?? companyId);
  return (
    <Level3SiteStudio
      companyId={companyId}
      companyName={companyName}
      computerId={computerId}
    />
  );
}

/** Rich project folders on the company profile — same folder language as Gruppen in the sidebar. */
function CompanyProjectsRich({
  companyId,
  agents,
}: {
  companyId: string;
  agents: AgentProfile[];
}) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => listProjects(companyId));
  const [name, setName] = useState("");
  const [appKey, setAppKey] = useState<AppKey>("arc");

  useEffect(() => {
    const refresh = () => setProjects(listProjects(companyId));
    refresh();
    return subscribeProjects(refresh);
  }, [companyId]);

  const agentsById = useMemo(() => {
    const map = new Map(agents.map((a) => [a.id, a]));
    return map;
  }, [agents]);

  const openProfile = (project: ConnectProject) => {
    void navigate({
      to: "/company/$companyId",
      params: { companyId },
      search: { level: 2, project: project.id },
    });
  };

  return (
    <section className="mt-5 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <CompanyStockTile
          companyId={companyId}
          companyName={
            agents[0] ? (getCompany(companyId)?.name ?? companyId) : companyId
          }
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Projects</h3>
        </div>
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            const app = getApp(appKey);
            createProject({
              companyId,
              name: trimmed,
              appFolder: appKey,
              logo: app.logo,
            });
            setName("");
            setProjects(listProjects(companyId));
          }}
        >
          <select
            className="h-8 rounded-full border border-border bg-white px-2 text-xs outline-none"
            onChange={(event) => setAppKey(event.target.value as AppKey)}
            value={appKey}
          >
            {APP_CATALOG.map((app) => (
              <option key={app.key} value={app.key}>
                {app.name}
              </option>
            ))}
          </select>
          <input
            className="h-8 w-36 rounded-full border border-border bg-white px-3 text-xs outline-none focus:border-foreground/40"
            onChange={(event) => setName(event.target.value)}
            placeholder="Neue Gruppe"
            value={name}
          />
          <button
            className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-semibold text-background"
            type="submit"
          >
            <IconPlus className="size-3.5" />
            Add
          </button>
        </form>
      </div>

      {projects.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Noch keine Ordner. Mit App-Logo anlegen — erscheint auch in der
          Sidebar unter Gruppen.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => {
            const app = getApp(project.appFolder);
            const nested = project.agentIds
              .map((id) => agentsById.get(id))
              .filter((a): a is AgentProfile => Boolean(a));
            const agentCount = project.agentIds.length;
            return (
              <li key={project.id}>
                <button
                  className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-transparent p-2.5 text-left transition hover:border-black/5 hover:bg-foreground/[0.03]"
                  onClick={() => openProfile(project)}
                  onDoubleClick={() => openProfile(project)}
                  type="button"
                >
                  <ProjectFolderIcon agents={nested} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">
                      {project.name}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">
                      {project.description || `${app.name}-Ordner`}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-800">
                        <img
                          alt=""
                          className="size-3 rounded-[2px] object-cover"
                          src={app.logo}
                        />
                        {app.name}
                      </span>
                      <span>
                        {agentCount} Agent{agentCount === 1 ? "" : "en"}
                      </span>
                    </div>
                  </div>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground/70" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** macOS-style folder tile — same language as Gruppen in the sidebar. */
function ProjectFolderIcon({ agents }: { agents: AgentProfile[] }) {
  const preview = agents.slice(0, 4);
  return (
    <span
      aria-hidden
      className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-b from-[#7ec8f5] to-[#3b9de0] shadow-sm ring-1 ring-black/10"
    >
      <span className="absolute inset-[4px] grid grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[10px] bg-white/25 p-[3px]">
        {Array.from({ length: 4 }).map((_, i) => {
          const agent = preview[i];
          if (!agent) {
            return (
              <span
                className="rounded-[4px] bg-white/35"
                key={`empty-${i}`}
              />
            );
          }
          return (
            <span
              className="overflow-hidden rounded-[4px] bg-white/50"
              key={agent.id}
            >
              <AbstractAvatar
                agentId={agent.id}
                name={agent.name}
                seed={agent.avatarSeed}
                size={22}
              />
            </span>
          );
        })}
      </span>
    </span>
  );
}

function CompanyMark({
  companyId,
  name,
}: {
  companyId: string;
  name: string;
}) {
  const company = getCompany(companyId);
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (company?.logo && !broken) {
    return (
      <img
        alt=""
        className="size-8 shrink-0 rounded-md object-cover"
        onError={() => setBroken(true)}
        src={company.logo}
      />
    );
  }

  return (
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
      style={{ background: company?.accent ?? "#334155" }}
    >
      {initials}
    </div>
  );
}
