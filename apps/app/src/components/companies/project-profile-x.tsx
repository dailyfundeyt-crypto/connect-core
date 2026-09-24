import {
  IconArrowLeft,
  IconBriefcase,
  IconFolder,
  IconUsers,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import {
  getApp,
  type ConnectProject,
} from "@/lib/companies/projects";
import type { AgentProfile } from "@/lib/agents/queries";

/**
 * X-style project profile — same rhythm as the company profile:
 * banner + app logo avatar, stats, and agents nested under this app folder.
 */
export function ProjectProfileX({
  project,
  companyId,
  companyName,
  agents,
}: {
  project: ConnectProject;
  companyId: string;
  companyName: string;
  agents: AgentProfile[];
}) {
  const app = getApp(project.appFolder);
  const logo = project.logo ?? app.logo;
  const banner = app.banner;
  const nested = agents.filter((a) => project.agentIds.includes(a.id));

  return (
    <div className="mx-auto w-full max-w-2xl bg-[#ffffff] text-foreground">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 bg-[#ffffff] px-4 py-2.5">
        <Link
          aria-label="Back to company"
          className="flex size-8 items-center justify-center rounded-full hover:bg-foreground/5"
          params={{ companyId }}
          search={{ level: 2 }}
          to="/company/$companyId"
        >
          <IconArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold tracking-tight">
            {project.name}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {companyName} · {app.name} project
          </p>
        </div>
      </div>

      <div className="relative h-36 w-full overflow-hidden bg-[#ffffff] sm:h-44">
        <img
          alt=""
          className="size-full object-cover object-center"
          decoding="async"
          src={banner}
        />
      </div>

      <div className="px-4">
        <div className="relative flex items-end justify-between">
          <div className="-mt-14 size-[88px] overflow-hidden rounded-2xl border-4 border-[#ffffff] bg-black shadow-[0_0_0_1px_rgba(0,0,0,0.04)] sm:-mt-16 sm:size-[108px]">
            <img
              alt=""
              className="size-full object-cover"
              decoding="async"
              src={logo}
            />
          </div>
          <div className="mb-1 flex items-center gap-2">
            <Link
              className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-bold text-background"
              params={{ companyId }}
              search={{ level: 3, project: project.id }}
              to="/company/$companyId"
            >
              Open in L3
            </Link>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <h2 className="text-xl font-extrabold tracking-tight">
            {project.name}
          </h2>
          <p className="text-[15px] text-muted-foreground">
            {project.description}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <IconBriefcase className="size-3.5" />
              {companyName}
            </span>
            <span className="inline-flex items-center gap-1">
              <IconFolder className="size-3.5" />
              App · {app.name}
            </span>
            <span className="inline-flex items-center gap-1">
              <IconUsers className="size-3.5" />
              {nested.length} agents
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-5 border-b border-black/5 text-[14px]">
          <span className="relative pb-3 font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-1 after:rounded-full after:bg-sky-500">
            Agents
          </span>
          <span className="pb-3 text-muted-foreground">About</span>
        </div>

        <ul className="divide-y divide-black/5 py-2">
          {nested.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No agents in this app folder yet. Assign people from Level 3.
            </li>
          ) : (
            nested.map((agent) => (
              <li key={agent.id}>
                <Link
                  className="flex items-center gap-3 py-3 hover:bg-foreground/[0.02]"
                  params={{ companyId }}
                  search={{ level: 3, project: project.id, agent: agent.id }}
                  to="/company/$companyId"
                >
                  <AbstractAvatar
                    agentId={agent.id}
                    name={agent.name}
                    seed={agent.avatarSeed}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">
                      {agent.name}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {agent.title}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Focus →
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
