import { useId } from "react";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import {
  resolveExtensionIcon,
  useExtensions,
  useSetExtension,
} from "@/extensions/context";
import { listExtensions } from "@/extensions/registry";

/**
 * Erweiterungen — globale An/Aus-Schalter für Spark, Flux, Hyper, Analysis.
 *
 * Wird in `app/src/routes/_authed/settings/index.tsx` unter dem
 * Storage-Bereich eingehängt. Eine Zeile pro Erweiterung mit Switch.
 *
 * - Default: alle AN
 * - AUS = komplett unsichtbar in Sidebar, Menüs und Settings
 * - Toggle ist sofort wirksam (Pub/Sub)
 */
export function ExtensionsSettingsPanel() {
  const state = useExtensions();
  const setEnabled = useSetExtension();

  return (
    <PageSection
      description="Spark, Flux, Hyper und Analysis sind standardmäßig aktiv. Schalte sie aus, wenn du sie nicht brauchst."
      title="Erweiterungen"
    >
      <PageRows>
        {listExtensions().map((manifest) => {
          const enabled = state[manifest.key];
          const Icon = resolveExtensionIcon(manifest.iconName);
          return (
            <ExtensionRow
              enabled={enabled}
              key={manifest.key}
              label={manifest.label}
              description={manifest.description}
              icon={<Icon aria-hidden className="size-4" stroke={1.5} />}
              onToggle={(next) => setEnabled(manifest.key, next)}
            />
          );
        })}
      </PageRows>
    </PageSection>
  );
}

function ExtensionRow({
  label,
  description,
  icon,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-foreground/80 ring-1 ring-sidebar-border/60"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <label
          className="block text-sm font-medium tracking-tight"
          htmlFor={id}
        >
          {label}
        </label>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch checked={enabled} id={id} onCheckedChange={onToggle} />
    </div>
  );
}

/**
 * Minimaler Schalter — bewusst KEINE shadcn-Switch, weil wir die hier
 * eigenständig klein halten. Wenn die App später einen Standard-Switch
 * global anbietet, kann das hier durch den gemeinsamen Baustein ersetzt
 * werden.
 */
function Switch({
  id,
  checked,
  onCheckedChange,
}: {
  id?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={id}
      className={
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors " +
        (checked ? "bg-sky-500" : "bg-muted-foreground/30")
      }
      id={id}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden
        className={
          "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition-transform " +
          (checked ? "translate-x-[22px]" : "translate-x-0.5")
        }
      />
    </button>
  );
}
