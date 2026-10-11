import { useQuery } from "@tanstack/react-query";
import {
  IconCalendar,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { calendarEventsQueryOptions } from "@/lib/calendar/queries";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import {
  getCalendarPrefs,
  resetCalendarPrefs,
  setCalendarPrefs,
  subscribeCalendarPrefs,
  type CalendarDateFormat,
  type CalendarPosition,
  type CalendarPrefs,
} from "@/lib/ui/calendar-prefs";

/**
 * The calendar's settings.
 *
 * WHY EVERY ROW HERE IS LOCAL. Everything on this page is how ONE person wants their panel drawn.
 * An administrator choosing the hour format for a whole company is choosing it wrongly for somebody,
 * and there is no value of it that is right for everyone — so none of these rows is a server setting
 * and none of them appears for anybody but the person whose panel it draws.
 *
 * WHICH MEANS NO SAVE BUTTON. A preference that needs a Save is a preference somebody can forget to
 * commit and then believe is on. Each row writes as it changes, and the floating button reads the same
 * store — so turning the panel off here makes it disappear on the page behind this one, with no
 * reload and nothing to press.
 */

/** A row that is either on or off. */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Item size="sm" variant="outline">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label={label}
          checked={checked}
          onCheckedChange={(value: boolean) => onChange(value)}
        />
      </ItemActions>
    </Item>
  );
}

/** A row that is a choice between a few named options. */
function ChoiceRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Item size="sm" variant="outline">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {options.map((option) => (
            <button
              aria-pressed={value === option.value}
              className={
                value === option.value
                  ? "rounded-md bg-muted px-2.5 py-1 text-xs font-medium transition-colors"
                  : "rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60"
              }
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </ItemActions>
    </Item>
  );
}

/**
 * Whether the Google account is connected.
 *
 * Read from the same route the panel uses rather than from the connected-accounts list, so this row
 * and the panel cannot disagree about the same fact. The window asked for is three days: enough to
 * be told, small enough that visiting settings does not pull a month of anybody's calendar.
 */
function ConnectionStatus() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);

  const query = useQuery(
    calendarEventsQueryOptions(from.toISOString(), to.toISOString()),
  );

  const connected = query.data?.connected === true;

  return (
    <Item size="sm" variant="outline">
      <ItemMedia>
        <span className="flex size-9 items-center justify-center rounded-lg border border-border">
          <IconCalendar className="size-4 text-muted-foreground" stroke={1.75} />
        </span>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Google Kalender</ItemTitle>
        <ItemDescription>
          {query.isPending
            ? "Wird geprüft…"
            : connected
              ? "Verbunden. Termine werden automatisch geladen."
              : "Nicht verbunden."}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <a
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href="/settings/connected-accounts/google-calendar"
        >
          {connected ? "Verwalten" : "Verbinden"}
        </a>
        {connected ? (
          <Button
            aria-label="Verbindung neu laden"
            onClick={() => void query.refetch()}
            size="icon-sm"
            variant="ghost"
          >
            <IconRefresh stroke={1.75} />
          </Button>
        ) : null}
      </ItemActions>
    </Item>
  );
}

export function CalendarSettingsPanel() {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => getCalendarPrefs());

  useEffect(
    () => subscribeCalendarPrefs(() => setPrefs(getCalendarPrefs())),
    [],
  );

  const update = <K extends keyof CalendarPrefs>(
    key: K,
    value: CalendarPrefs[K],
  ): void => {
    setCalendarPrefs({ [key]: value } as Partial<CalendarPrefs>);
  };

  return (
    <>
      <PageSection
        description="Deine Termine aus Google, in einem Fenster, das sich über den Knopf rechts unten ein- und ausblenden lässt."
        title="Kalender"
      >
        <PageRows>
          <ConnectionStatus />
          <ToggleRow
            checked={prefs.visible}
            description="Der Knuss und das Kalenderfenster erscheinen auf allen Seiten."
            label="Kalender anzeigen"
            onChange={(value) => update("visible", value)}
          />
          <ToggleRow
            checked={prefs.hour24}
            description="Zwölf- oder Vierundzwanzig-Stunden-Anzeige für Uhrzeiten."
            label="24-Stunden-Format"
            onChange={(value) => update("hour24", value)}
          />
          <ToggleRow
            checked={prefs.showWeekNumbers}
            description="Eine zusätzliche Spalte mit der Kalenderwoche."
            label="Wochennummern"
            onChange={(value) => update("showWeekNumbers", value)}
          />
        </PageRows>
      </PageSection>

      <PageSection description="Wie der Kalender gezeichnet wird." title="Darstellung">
        <PageRows>
          <ChoiceRow<CalendarPosition>
            description="Wo der Knopf liegt, über den sich das Fenster öffnet."
            label="Position"
            onChange={(value) => update("position", value)}
            options={[
              { value: "bottom-right", label: "Rechts" },
              { value: "bottom-left", label: "Links" },
            ]}
            value={prefs.position}
          />
          <ChoiceRow<CalendarDateFormat>
            description="Reihenfolge von Tag, Monat und Jahr."
            label="Datumsformat"
            onChange={(value) => update("dateFormat", value)}
            options={[
              { value: "de-DE", label: "TT.MM.JJJJ" },
              { value: "en-GB", label: "DD.MM.YYYY" },
              { value: "en-US", label: "MM/DD/YYYY" },
            ]}
            value={prefs.dateFormat}
          />
          <ChoiceRow<"monday" | "sunday">
            description="Ob die Woche am Montag oder am Sonntag beginnt."
            label="Wochenbeginn"
            onChange={(value) => update("weekStartsOn", value)}
            options={[
              { value: "monday", label: "Montag" },
              { value: "sunday", label: "Sonntag" },
            ]}
            value={prefs.weekStartsOn}
          />
          <ChoiceRow<"system" | "light" | "dark">
            description="Oder der Darstellung der App folgen."
            label="Erscheinungsbild"
            onChange={(value) => update("theme", value)}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Hell" },
              { value: "dark", label: "Dunkel" },
            ]}
            value={prefs.theme}
          />
        </PageRows>
      </PageSection>

      <PageSection
        description="Wohin der Knopf im Kalenderfenster führt."
        title="Google Kalender"
      >
        <PageRows>
          <Item size="sm" variant="outline">
            <ItemContent>
              <ItemTitle>Großansicht</ItemTitle>
              <ItemDescription>
                Die Adresse, die in einem neuen Tab geöffnet wird.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <a
                className={buttonVariants({ size: "sm", variant: "outline" })}
                href={prefs.googleCalendarUrl}
                rel="noreferrer"
                target="_blank"
              >
                <IconExternalLink stroke={1.75} />
                Öffnen
              </a>
            </ItemActions>
          </Item>

          <Item size="sm" variant="outline">
            <ItemContent>
              <ItemTitle>Adresse</ItemTitle>
              <ItemDescription>
                Standardmäßig{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  calendar.google.com/calendar
                </code>
                .
              </ItemDescription>
              <input
                aria-label="Adresse für die Großansicht"
                className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
                onChange={(event) =>
                  update("googleCalendarUrl", event.target.value)
                }
                spellCheck={false}
                type="url"
                value={prefs.googleCalendarUrl}
              />
            </ItemContent>
          </Item>
        </PageRows>
      </PageSection>

      <div className="mt-12 flex justify-end border-t border-border pt-6">
        <Button onClick={resetCalendarPrefs} variant="outline">
          <IconRefresh stroke={1.75} />
          Auf Standard zurücksetzen
        </Button>
      </div>
    </>
  );
}