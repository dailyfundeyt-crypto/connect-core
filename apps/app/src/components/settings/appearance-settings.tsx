import { IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const options = [
  {
    dark: true,
    label: "Dunkel",
    description: "Der Standard für Connect.",
    Icon: IconMoon,
  },
  {
    dark: false,
    label: "Hell",
    description: "Helle Oberflächen und dunkle Schrift.",
    Icon: IconSun,
  },
] as const;

export function AppearanceSettings() {
  const { dark, setDark } = useTheme();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Darstellung</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Wähle den Farbmodus für die ganze App. Deine Auswahl wird gespeichert und beim nächsten Öffnen wieder verwendet.
        </p>
      </header>

      <div aria-label="Farbmodus" className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup">
        {options.map(({ dark: optionDark, label, description, Icon }) => {
          const selected = dark === optionDark;
          return (
            <button
              aria-checked={selected}
              className={cn(
                "flex min-h-28 items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-accent/50",
              )}
              key={label}
              onClick={() => setDark(optionDark)}
              role="radio"
              type="button"
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
              </span>
              <span aria-hidden="true" className={cn("mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-muted-foreground/40")}>
                {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
