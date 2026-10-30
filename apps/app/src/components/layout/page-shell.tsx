import { IconChevronLeft } from "@tabler/icons-react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { SidebarToggle, useSidebarToggleVisible } from "./sidebar-toggle";

/**
 * The frame every configuration screen sits in.
 *
 * WHAT THIS IS FIXING. Admin was nine pages that shared no layout: four container widths plus three
 * pages with no container at all, four heading sizes, four padding schemes, and a sidebar 20px wider
 * than the rest of the app. Three of those pages imported nothing from `components/ui` and drew
 * their own buttons, inputs and tables. The result did not read as a different screen, it read as a
 * different application — which is the impression an administrator forms at exactly the moment they
 * are deciding whether to trust it with credentials.
 *
 * The shape was never in doubt: Skills and Settings already had it. So this is that shape, extracted
 * once and used everywhere, INCLUDING by Skills and Settings. Leaving those two as hand-written
 * copies would mean three dialects rather than two, and the next screen somebody writes copies
 * whichever it happened to see first.
 */

/**
 * `prose` is the default because configuration is mostly reading. A measure of around 65 characters
 * is where prose stays comfortable, and a row of label-and-control has no business being wider than
 * the sentence explaining it.
 *
 * `wide` exists for one page. An audit log is a table you scan, and forcing it into the prose column
 * would wrap every row. It is not a licence for anything else to be wide.
 */
type ShellWidth = "prose" | "wide";

const WIDTHS: Record<ShellWidth, string> = {
  prose: "max-w-2xl",
  wide: "max-w-5xl",
};

export function PageShell({
  action,
  children,
  className,
  description,
  title,
  width = "prose",
  backButton,
}: {
  /** Sits on the title's baseline. For the page's one primary verb, if it has one. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title: string;
  width?: ShellWidth;
  backButton?: {
    linkProps: Record<string, unknown>;
    label: string;
  };
}) {
  /*
   * The bar carries the toggle and the Back link, and is drawn when it has at least one of them.
   * The screens with a Back link already drew exactly this bar, so for them nothing changes; what
   * changed is that a sidebar is now reason enough on its own, because the toggle has to sit at the
   * pane's left edge in both states and the prose column is centred — a control inside it would be
   * 400px from the edge it belongs to on a wide screen. Drawing it with neither would be a 56px
   * band holding nothing, which reads as a layout bug rather than as chrome.
   *
   * The question is whether the toggle will DRAW, not whether a sidebar exists: it hides itself on
   * a desktop-width window while the sidebar is already open, which is most of the time on these
   * screens. Asking `useSidebarToggleVisible` rather than re-deriving the condition here is what
   * keeps the two from drifting apart and reintroducing that empty band. It also still answers false
   * on `/assist` and `/link/slack`, which draw PageShell directly under `_authed` with no sidebar
   * provider at all, so there is nothing for a toggle to act on there.
   */
  const showToggle = useSidebarToggleVisible();
  const bar = showToggle || !!backButton;

  return (
    <>
      {bar ? (
        <div className="max-w-7xl w-full h-14 flex items-center gap-1 px-3">
          {showToggle ? <SidebarToggle /> : null}
          {!!backButton && (
            <Button
              variant="ghost"
              render={(props) => <Link {...(backButton.linkProps as any)} {...props} />}
            >
              <IconChevronLeft />
              {backButton.label}
            </Button>
          )}
        </div>
      ) : null}
      {/*
       * The scroller, and it has to live here rather than in either shell, because the two shells
       * this frame is used under disagree about who scrolls.
       *
       * Under `_authed` — admin, settings — the document scrolls, so a page taller than the window
       * has always just worked. Under `_authed/_app` it does not: that shell is `h-svh
       * overflow-hidden` on purpose ("one viewport, never scrolls: panes scroll inside it") and its
       * `main` is `overflow-hidden` too, so a PageShell taller than the window was silently CLIPPED
       * — 246px of Skills sat below the fold with no way to reach it, by keyboard or otherwise.
       *
       * `min-h-0` is the load-bearing half of `min-h-0 flex-1`: a flex item's default `min-height:
       * auto` refuses to shrink below its content, so `flex-1` alone would grow this past the pane
       * and clip exactly as before. Under `_authed` both are inert — the parent is not a flex
       * container — and `overflow-y-auto` on an auto-height element shows no scrollbar, so those
       * eighteen screens are unaffected.
       *
       * Separate from the centred column below so the scrollbar rides the pane's edge instead of
       * appearing inside a 630px measure with content either side of it.
       */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            "mx-auto flex w-full flex-col px-4 pb-12",
            // Without a bar above it the heading keeps the full original space.
            bar ? "pt-8" : "pt-12",
            WIDTHS[width],
            className,
          )}
        >
          <header className="flex flex-col gap-2">
            <div className="flex flex-row items-center justify-between gap-4">
              <h1 className="font-bold text-2xl">{title}</h1>
              {action}
            </div>
            {description ? (
              <p className="max-w-prose text-pretty text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            ) : null}
          </header>
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * A titled group of rows.
 *
 * The gap above a section is deliberately large. These pages are lists of unrelated decisions, and
 * the space is what stops the eye running two of them together — it is doing the work a divider
 * would otherwise do, without drawing a line.
 */
export function PageSection({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title?: string;
}) {
  return (
    <section className={cn("mt-12", className)}>
      {title ? (
        <div className="flex min-h-8 flex-row items-center justify-between gap-4">
          <h2 className="font-bold text-lg">{title}</h2>
          {action}
        </div>
      ) : null}
      {description ? (
        <p className="mt-1 max-w-prose text-pretty text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The stack that rows live in.
 *
 * Rows are `<Item size="sm" />`, one per setting, and each is its own card with space between them.
 *
 * They used to be divided rows inside a single bordered box — `rounded-none` with a `<Separator />`
 * between — which is the denser, older look. It measured 1px between rows, so three settings read as
 * one block with lines through it, and a row whose control sat in the top-right corner left the rest
 * of its own height empty. Separate cards give each row a readable block of its own and let the gap
 * do the grouping, which is what a settings list actually needs.
 *
 * Rendering nothing when there is nothing stays deliberate — an empty bordered box reads as a thing
 * that failed to load, where absence reads as nothing to see yet.
 */
export function PageRows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-4 flex flex-col", className)}>
      {/*
       * Each row is a card in its own right now, so it keeps `Item`'s own radius and border. The
       * rounding and the border are restored on every row rather than once on the stack, because
       * the stack no longer clips anything.
       *
       * The gap lives here rather than on the inner stack: the rows are separated by `<Separator />`
       * elements, and those are display:none below, which leaves a flex gap that is measured between
       * a visible row and an invisible one — and a gap to a collapsed box is zero. The separators
       * are removed from the flow entirely instead, so this is the only gap in play.
       */}
      <style>{ROWS_CARD_STYLES}</style>
      <div
        data-slot="rows-stack"
        className="flex flex-col gap-3 [&>[data-slot=item]]:rounded-lg [&>[data-slot=item]]:border [&>[data-slot=item]]:border-border [&>[data-slot=item]]:bg-card"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Gives every row its own card.
 *
 * `Item` sizes itself for a divided list — a transparent background and no side border, so the
 * rows read as one surface. As standalone cards they need both, and the hover that a divided list
 * paints across the full width becomes a hover on the card itself, which is the affordance a
 * standalone row can carry on its own.
 */
const ROWS_CARD_STYLES = `
[data-slot="rows-stack"] > [data-slot="item"] {
  border: 1px solid var(--color-border, rgba(28,27,25,0.12));
  border-radius: 0.5rem;
  background-color: var(--color-card, Canvas);
  transition: background-color 150ms ease, border-color 150ms ease;
}
[data-slot="rows-stack"] > [data-slot="item"]:hover {
  background-color: color-mix(in oklab, var(--color-card, Canvas) 94%, currentColor 6%);
}

/*
 * A row's description is a second line under its title, and the action sits beside both. The row
 * grows to the taller of the two, so a short control on a two-line row left its own half empty —
 * aligning the action to the top edge rather than centring it keeps the two texts reading as one
 * line, and the vertical gap between rows does the rest.
 */
[data-slot="rows-stack"] > [data-slot="item"] [data-slot="item-actions"] {
  align-items: flex-start;
  padding-top: 0.125rem;
}

/*
 * The separators were drawn for a divided list. Between separate cards they would hang in the gap
 * with a card's padding on either side, so they leave the flow entirely rather than being restyled
 * — a flex gap counts a display:none child as absent, but a zero-height one as present, and the
 * stack's own gap is what spaces the cards.
 */
[data-slot="rows-stack"] > [data-slot="separator"] {
  display: none;
}`;

/**
 * What a section says when it has nothing to list.
 *
 * Said in a sentence rather than drawn as an illustration with a heading: on a configuration screen
 * "nothing here yet" is a fact, not an event, and the page already told you what the section is for.
 */
export function PageEmpty({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-muted-foreground text-sm">{children}</p>;
}
