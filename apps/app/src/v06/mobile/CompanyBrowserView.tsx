/**
 * v06 mobileV2 (A14): Mobile CompanyBrowserView
 * Zeigt nur die Websites und Gruppen der aktiven Firma.
 * Die Firmen-Chips (Flux, Spark, Connect, Hyper …) werden ausgeblendet.
 */
import { useEffect, useMemo, useState } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconLayoutColumns,
  IconLayoutGrid,
  IconPencil,
  IconWorld,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { ConnectCompany } from "@/lib/companies/store";
import { getFlag } from "@/contracts/v06/flags";
import { EmptyState } from "@/v06/design";

export type Company = ConnectCompany;

export type BrowserRow = {
  key: string;
  title: string;
  subtitle: string;
  sources: string[];
  accent?: string;
  url?: string;
  url2?: string;
  badge?: string;
  notePath?: string;
};

export type BrowserSection = {
  id: string;
  title: string;
  rows: BrowserRow[];
  /** Echte Gruppen-ID (nur bei Gruppen, nicht bei "Weitere Links"/"Tabs der Agenten"). */
  groupId?: string;
  /** Eigenname der Gruppe (ohne "Eltern > Kind"-Pfad). */
  groupLabel?: string;
};

/**
 * Filtert Browser-Sektionen nach Suchbegriff.
 */
export function filterBrowserSections(
  sections: BrowserSection[],
  search?: string,
): BrowserSection[] {
  const needle = (search ?? "").trim().toLowerCase();
  if (!needle) return sections;
  return sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) =>
        [row.title, row.subtitle, row.url, section.title].some((f) =>
          f?.toLowerCase().includes(needle),
        ),
      ),
    }))
    .filter((section) => section.rows.length > 0);
}

/**
 * Browser-Icon wie ein Bot-Bild: Favicon, sonst Icon-Kandidat, sonst Weltkugel.
 */
export function AppGlyph({
  sources,
  accent,
  size = 52,
}: {
  sources: string[];
  accent?: string;
  size?: number;
}) {
  const key = sources.join("|");
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [key]);
  const src = sources[index];

  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-gradient-to-br from-white/[0.10] to-white/[0.03] ring-1 ring-white/10"
      style={{ height: size, width: size }}
    >
      {src ? (
        <img
          alt=""
          className="size-[58%] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          draggable={false}
          onError={() => setIndex((i) => i + 1)}
          referrerPolicy="no-referrer"
          src={src}
        />
      ) : (
        <IconWorld className="size-6 text-white/55" stroke={1.6} />
      )}
      {accent && !src ? (
        <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: accent }} />
      ) : null}
    </span>
  );
}

export interface CompanyBrowserViewProps {
  activeCompany: Company | null | undefined;
  sections: BrowserSection[];
  search?: string;
  collapsed: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  onOpenRow: (row: BrowserRow) => void;
  // Vorarbeit: Inline-Gruppen-Umbenennung im Handy
  renamingGroupId?: string | null;
  renameDraft?: string;
  onStartRename?: (groupId: string, initialTitle: string) => void;
  onCommitRename?: (groupId: string, fallbackTitle: string) => void;
  onChangeRenameDraft?: (val: string) => void;
  onCancelRename?: () => void;
}

export function CompanyBrowserView({
  activeCompany,
  sections,
  search = "",
  collapsed,
  onToggleSection,
  onOpenRow,
  renamingGroupId,
  renameDraft = "",
  onStartRename,
  onCommitRename,
  onChangeRenameDraft,
  onCancelRename,
}: CompanyBrowserViewProps) {
  const needle = search.trim().toLowerCase();
  const filteredBrowser = useMemo(
    () => filterBrowserSections(sections, needle),
    [sections, needle],
  );

  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <section aria-label="Browser" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-[var(--p-text-1)]">
        <div className="px-5 pb-2 pt-5">
          <h2 className="text-[26px] font-semibold tracking-tight text-[var(--p-text-1)]">Browser</h2>
          <p className="mt-1 text-[14px] text-[var(--p-text-2)]">
            Deine Links aus Helium{activeCompany?.name ? ` · ${activeCompany.name}` : ""}
          </p>
        </div>

        {filteredBrowser.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              compact
              icon={<IconLayoutGrid className="size-6 text-[var(--p-accent)]" stroke={1.5} />}
              title={needle ? "Keine Treffer" : "Keine Links vorhanden"}
              description={
                needle
                  ? `Keine Treffer für „${search.trim()}“.`
                  : `Noch keine Links für ${activeCompany?.name || "dieses Unternehmen"}. Tippe oben rechts auf +, um einen Link zu speichern – er erscheint auch am PC.`
              }
            />
          </div>
        ) : (
          filteredBrowser.map((section) => {
            const isCollapsed = !needle && collapsed[section.id] === true;
            return (
              <section className="pb-2" key={section.id}>
                <div className="flex items-center gap-1 pr-5">
                  <button
                    aria-expanded={!isCollapsed}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-5 py-2 text-[15px] font-medium tracking-wide text-[var(--p-text-2)] transition-colors hover:text-[var(--p-text-1)] active:opacity-80"
                    onClick={() => onToggleSection(section.id)}
                    type="button"
                  >
                    <span>{section.title}</span>
                    <span className="rounded-full bg-[var(--p-surface-3)] px-2 py-0.5 text-[12px] font-normal text-[var(--p-text-3)]">
                      {section.rows.length}
                    </span>
                    <IconChevronDown
                      className={cn("size-[17px] transition-transform duration-200", isCollapsed && "-rotate-90")}
                      stroke={1.75}
                    />
                  </button>

                  {section.groupId && onStartRename && onCommitRename ? (
                    renamingGroupId === section.groupId ? (
                      <input
                        aria-label="Gruppenname"
                        autoFocus
                        className="mt-1 h-9 min-w-0 flex-1 rounded-[var(--p-radius-md)] border border-[var(--p-border-strong)] bg-[var(--p-surface-2)] px-2.5 text-[15px] text-[var(--p-text-1)] outline-none placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)]"
                        onBlur={() => onCommitRename(section.groupId as string, section.groupLabel ?? section.title)}
                        onChange={(e) => onChangeRenameDraft?.(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onCommitRename(section.groupId as string, section.groupLabel ?? section.title);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            onCancelRename?.();
                          }
                        }}
                        value={renameDraft}
                      />
                    ) : (
                      <button
                        aria-label={`Gruppe ${section.groupLabel ?? section.title} umbenennen`}
                        className="flex size-11 shrink-0 items-center justify-center rounded-[var(--p-radius-md)] text-[var(--p-text-3)] transition-colors hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)] active:scale-95"
                        onClick={() => onStartRename(section.groupId as string, section.groupLabel ?? section.title)}
                        type="button"
                      >
                        <IconPencil className="size-4" stroke={1.75} />
                      </button>
                    )
                  ) : null}
                </div>

                {isCollapsed ? null : section.rows.length === 0 ? (
                  <p className="px-5 pb-2 pt-1 text-[14px] text-[var(--p-text-3)]">Noch keine Links in dieser Gruppe.</p>
                ) : (
                  <ul className="space-y-2 px-4">
                    {section.rows.map((row) => (
                      <li key={row.key}>
                        <button
                          className="flex w-full min-h-[56px] select-none items-center gap-3.5 rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-3 text-left transition-all duration-150 hover:border-[var(--p-border-strong)] active:scale-[0.99]"
                          onClick={() => onOpenRow(row)}
                          type="button"
                        >
                          <AppGlyph accent={row.accent} sources={row.sources} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="min-w-0 truncate text-[16px] font-semibold tracking-tight text-[var(--p-text-1)]">
                                {row.title}
                              </span>
                              {row.badge ? (
                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 px-2 py-0.5 text-[11px] font-medium text-[var(--p-accent)]">
                                  <IconLayoutColumns className="size-3" />
                                  {row.badge}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 line-clamp-1 text-[13px] text-[var(--p-text-2)]">{row.subtitle}</span>
                          </span>
                          <IconChevronRight className="size-5 shrink-0 text-[var(--p-text-3)]" stroke={1.75} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </section>
    );
  }

  return (
    <section aria-label="Browser" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="px-5 pb-1 pt-5">
        <h2 className="text-[26px] font-semibold tracking-tight">Browser</h2>
        <p className="mt-1 text-[14px] text-white/45">
          Deine Links aus Helium{activeCompany?.name ? ` · ${activeCompany.name}` : ""}
        </p>
      </div>

      {/* ACHTUNG: Keine MobileBrowserCompanyChips in CompanyBrowserView (mobileV2 Anforderung: Chips ausblenden) */}

      {filteredBrowser.length === 0 ? (
        <div className="connect-mobile-glass mx-5 mt-5 rounded-3xl px-5 py-10 text-center">
          <IconLayoutGrid className="mx-auto size-8 text-white/35" />
          <p className="mt-3 text-[15px] text-white/55">
            {needle
              ? `Keine Treffer für „${search.trim()}“.`
              : `Noch keine Links für ${activeCompany?.name || "dieses Unternehmen"}. Tippe oben rechts auf +, um einen Link zu speichern – er erscheint auch am PC.`}
          </p>
        </div>
      ) : (
        filteredBrowser.map((section) => {
          const isCollapsed = !needle && collapsed[section.id] === true;
          return (
            <section className="pb-1" key={section.id}>
              <div className="flex items-center gap-1 pr-5">
                <button
                  aria-expanded={!isCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-1.5 px-5 pb-1 pt-4 text-[15px] font-medium tracking-wide text-white/55 active:text-white/80"
                  onClick={() => onToggleSection(section.id)}
                  type="button"
                >
                  {section.title}
                  <span className="text-[13px] font-normal text-white/30">{section.rows.length}</span>
                  <IconChevronDown
                    className={cn("size-[17px] transition-transform duration-200", isCollapsed && "-rotate-90")}
                    stroke={1.75}
                  />
                </button>

                {section.groupId && onStartRename && onCommitRename ? (
                  renamingGroupId === section.groupId ? (
                    <input
                      aria-label="Gruppenname"
                      autoFocus
                      className="mt-4 h-8 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 text-[15px] text-white outline-none placeholder:text-white/40 focus:border-white/40"
                      onBlur={() => onCommitRename(section.groupId as string, section.groupLabel ?? section.title)}
                      onChange={(e) => onChangeRenameDraft?.(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onCommitRename(section.groupId as string, section.groupLabel ?? section.title);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          onCancelRename?.();
                        }
                      }}
                      value={renameDraft}
                    />
                  ) : (
                    <button
                      aria-label={`Gruppe ${section.groupLabel ?? section.title} umbenennen`}
                      className="mt-4 flex size-8 shrink-0 items-center justify-center rounded-lg text-white/40 active:bg-white/10 active:text-white/80"
                      onClick={() => onStartRename(section.groupId as string, section.groupLabel ?? section.title)}
                      type="button"
                    >
                      <IconPencil className="size-4" stroke={1.75} />
                    </button>
                  )
                ) : null}
              </div>

              {isCollapsed ? null : section.rows.length === 0 ? (
                <p className="px-5 pb-2 pt-1 text-[14px] text-white/30">Noch keine Links in dieser Gruppe.</p>
              ) : (
                <ul>
                  {section.rows.map((row) => (
                    <li key={row.key}>
                      <button
                        className="flex w-full select-none items-center gap-4 px-5 py-3 text-left active:bg-white/[0.06]"
                        onClick={() => onOpenRow(row)}
                        type="button"
                      >
                        <AppGlyph accent={row.accent} sources={row.sources} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="min-w-0 truncate text-[17px] font-semibold tracking-tight text-white">
                              {row.title}
                            </span>
                            {row.badge ? (
                              <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-400/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                                <IconLayoutColumns className="size-3" />
                                {row.badge}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 line-clamp-1 text-[15px] text-white/50">{row.subtitle}</span>
                        </span>
                        <IconChevronRight className="size-5 shrink-0 text-white/25" stroke={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </section>
  );
}
