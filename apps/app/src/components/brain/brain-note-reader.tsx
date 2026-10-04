import { IconArrowBackUp, IconChevronRight, IconExternalLink, IconLink, IconLock } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { BrainMarkdownBody, type BrainProperty, parseFrontmatter } from "@/components/brain/brain-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { brainBacklinksQueryOptions, brainFileQueryOptions, brainStatusQueryOptions } from "@/lib/brain/queries";

const PROPERTY_LABELS: Record<string, string> = {
  type: "Typ",
  status: "Status",
  agent: "Agent",
  projekt: "Projekt",
  project: "Projekt",
  created: "Erstellt",
  updated: "Aktualisiert",
  confidence: "Sicherheit",
  tags: "Tags",
  source: "Quelle",
  sources: "Quellen",
};
const HIDDEN = new Set(["title", "aliases"]);

function PropertyChips({ properties }: { properties: BrainProperty[] }) {
  const shown = properties.filter((p) => !HIDDEN.has(p.key));
  if (!shown.length) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 border-b pb-5">
      {shown.map((property) => (
        <span
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 py-0.5 pr-2 pl-2 text-[11.5px] leading-5 text-muted-foreground"
          key={property.key}
          title={`${property.key}: ${property.values.join(", ")}`}
        >
          <span className="opacity-70">{PROPERTY_LABELS[property.key] ?? property.key}</span>
          <span className="truncate text-foreground/80">
            {property.key === "tags" ? property.values.map((tag) => `#${tag}`).join(" ") : property.values.join(", ")}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Eine Brain-Notiz zum Lesen, mit Titel, Eigenschaften, Inhalt und Rückverweisen. */
export function BrainNoteReader({
  path,
  files,
  onOpen,
  onBack,
}: {
  path: string;
  files: string[];
  onOpen: (path: string) => void;
  onBack?: () => void;
}) {
  const file = useQuery(brainFileQueryOptions(path));
  const backlinks = useQuery(brainBacklinksQueryOptions(path));
  const status = useQuery(brainStatusQueryOptions());
  const isVault = path.startsWith("Vault/");
  const vaultPath = status.data?.available ? status.data.vaultPath : null;
  const vaultName = vaultPath?.split(/[\\/]/).filter(Boolean).pop();
  const inVault = isVault ? path.slice(6).replace(/\.md$/i, "") : `Brain/${path.replace(/\.md$/i, "")}`;
  const obsidianUrl = vaultName ? `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(inVault)}` : null;
  const crumbs = path.replace(/\.md$/i, "").split("/");

  if (file.isPending) {
    return (
      <div className="brain-reader flex flex-col gap-3 pt-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (file.error) return <p className="p-6 text-sm text-destructive">{file.error.message}</p>;
  if (!file.data) return <p className="p-6 text-sm text-muted-foreground">Datei nicht gefunden.</p>;

  const { properties, body } = parseFrontmatter(file.data.content);
  const titleProp = properties.find((p) => p.key === "title")?.values[0];
  const h1 = /^\s*#\s+(.+?)\s*$/m.exec(body);
  const firstLine = body.trimStart().split("\n")[0] ?? "";
  // Die erste H1 wird zum Seitentitel, wie bei Notion; sonst Titel aus Frontmatter oder Dateiname.
  const title = (h1 && firstLine.startsWith("#") && !firstLine.startsWith("##") ? h1[1] : titleProp) ?? crumbs[crumbs.length - 1];
  const rest = h1 && firstLine.startsWith("# ") ? body.trimStart().slice(firstLine.length) : body;

  return (
    <article className="brain-reader px-1 pt-2 pb-10">
      <div className="mb-5 flex items-center gap-1 text-xs text-muted-foreground">
        {onBack ? (
          <button className="mr-1 rounded p-0.5 hover:bg-foreground/5" onClick={onBack} title="Zurück" type="button">
            <IconArrowBackUp className="size-3.5" />
          </button>
        ) : null}
        {isVault ? null : <span>Brain</span>}
        {crumbs.map((crumb, index) => (
          <span className="flex items-center gap-1" key={`${crumb}-${index}`}>
            {isVault && index === 0 ? null : <IconChevronRight className="size-3 opacity-50" />}
            <span className={index === crumbs.length - 1 ? "text-foreground/80" : undefined}>{crumb}</span>
          </span>
        ))}
        {isVault ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px]" title="Notiz im Obsidian-Vault – in Connect nur lesen">
            <IconLock className="size-3" /> nur lesen
          </span>
        ) : null}
        {obsidianUrl ? (
          <a className="ml-2 inline-flex items-center gap-1 hover:text-foreground" href={obsidianUrl} title="In Obsidian öffnen">
            <IconExternalLink className="size-3" /> Obsidian
          </a>
        ) : null}
        <span className="ml-auto shrink-0 pl-3">
          {new Date(file.data.mtime).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>
      <h1 className="!mt-0 !mb-3 !border-0 !text-[2.1rem] !leading-tight !font-bold">{title}</h1>
      <PropertyChips properties={properties} />
      <BrainMarkdownBody files={files} fromPath={path} markdown={rest} onOpen={onOpen} />

      <section className="mt-12 border-t pt-4">
        <h4 className="!m-0 !mb-2 flex items-center gap-1.5 !text-xs !font-semibold !tracking-wide uppercase !text-muted-foreground">
          <IconLink className="size-3.5" />
          Rückverweise {backlinks.data?.backlinks.length ? `(${backlinks.data.backlinks.length})` : ""}
        </h4>
        {backlinks.isPending ? (
          <Skeleton className="h-6 w-1/2" />
        ) : backlinks.data?.backlinks.length ? (
          <ul className="!m-0 !list-none !p-0">
            {backlinks.data.backlinks.map((link) => (
              <li className="!m-0 !p-0" key={link.path}>
                <button
                  className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-foreground/5"
                  onClick={() => onOpen(link.path)}
                  type="button"
                >
                  <span className="text-sm font-medium">{link.path.split("/").pop()?.replace(/\.md$/i, "")}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {link.path}
                    {link.context ? ` · ${link.context.replace(/\[\[|\]\]/g, "")}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="!m-0 text-xs text-muted-foreground">Keine Notiz verlinkt hierher.</p>
        )}
      </section>
    </article>
  );
}
