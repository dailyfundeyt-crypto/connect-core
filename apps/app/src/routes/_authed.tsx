import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SecurityGate } from "../components/auth/security-gate";
import { CalendarDock } from "../components/calendar/calendar-dock";
import { currentUserQueryOptions, needsOnboarding } from "../lib/auth/queries";
import { CopilotProvider } from "../lib/copilot/provider";
import { AppHotkeys } from "../lib/hotkeys/app-hotkeys";
import { MobileThemeSync } from "../components/mobile/mobile-theme-sync";
import { ExtensionsProvider } from "@/extensions/context";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    if (!user) {
      throw redirect({ to: "/sign" });
    }
    /*
     * Somebody who has not finished onboarding goes there and nowhere else. Here rather than in
     * `_app`, so admin and settings are behind the same gate; checked against the destination so
     * the onboarding route itself stays reachable.
     */
    if (needsOnboarding(user) && location.pathname !== "/onboarding") {
      throw redirect({ to: "/onboarding" });
    }
  },
  // Mounted INSIDE the authed boundary, not at the root: the runtime endpoint requires a session, so
  // a provider above the sign-in gate would open a run for a visitor who has not signed in yet.
  component: () => (
    <SecurityGate>
      {/* Above CopilotProvider so an extension can read company state; inside
          SecurityGate for the same reason as the rest — no session, no tree. */}
      <ExtensionsProvider>
        <CopilotProvider>
          <AppHotkeys />
          <MobileThemeSync />
          <Outlet />
          {/*
            * After the Outlet so it stacks above the page rather than under it, and outside it so it
            * survives the pages that own their own scrolling. Inside the authed boundary for the same
            * reason the rest of this tree is: the calendar is one person's, and there is nothing to show
            * somebody who has not signed in.
            */}
          <CalendarDock />
        </CopilotProvider>
      </ExtensionsProvider>
    </SecurityGate>
  ),
});
