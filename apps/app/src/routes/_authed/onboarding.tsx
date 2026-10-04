import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import Avatar from "boring-avatars";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import * as React from "react";
import useMeasure from "react-use-measure";
import AgentOrb from "@/components/agents/orb/agent-orb";
import { Composer } from "@/components/channels/composer";
import { DesktopIllustration } from "@/components/computer/desktop-illustration";
import { ComputerPlaceholder } from "@/components/computer/placeholder";
import { Button } from "@/components/ui/button";
import { type AgentProfile, agentListQueryOptions } from "@/lib/agents/queries";
import { currentUserQueryOptions, needsOnboarding } from "@/lib/auth/queries";
import { appConfig } from "@/lib/generated/application-config";
import { completeOnboardingMutationOptions } from "@/lib/onboarding/mutations";
import { connectGoogleDrive, fetchDriveBackupStatus } from "@/lib/drive-backup/api";
import { queryClient } from "@/query-client";

export const Route = createFileRoute("/_authed/onboarding")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    // Somebody who has finished, or whose deployment tracks no onboarding, has no business here.
    if (!user || !needsOnboarding(user)) {
      throw redirect({ to: "/" });
    }
  },
  component: RouteComponent,
});

function WelcomeStep() {
  return (
    <div className="w-full flex flex-col items-center justify-center">
      <img
        src="/brand/connect-logo.png"
        alt="Connect"
        className="size-16 rounded-2xl shadow-xl border border-border/60 mb-5"
      />
      <h1 className="text-3xl font-semibold tracking-tight max-w-md text-center">
        Welcome to Connect
      </h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-sm">
        Your self-hosted AI coworker workspace with integrated real browser automation.
      </p>
      <div className="h-4" />
      <div className="max-w-md w-full mx-auto pointer-events-none mt-10">
        <Composer
          compact
          className="scale-90"
          editorClassName="text-base"
          initialValue="Hand off tasks to your team of agents"
        />
      </div>
    </div>
  );
}

function ComputerUseStep() {
  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="text-3xl font-semibold tracking-tight max-w-md text-center">
        Each agent has its own computer &amp; real browser
      </h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
        Autonomous web browsing, persistent sessions, and tool actions without iframe restrictions.
      </p>
      <div className="h-6" />
      <div className="relative aspect-5/3 w-full max-w-lg rounded-2xl overflow-hidden border border-border shadow-2xl">
        <ComputerPlaceholder className="absolute inset-0 h-full w-full" />
        <DesktopIllustration />
      </div>
    </div>
  );
}

/** What a roster card needs — placeholders carry these three fields and nothing more. */
type RosterCard = Pick<AgentProfile, "id" | "name" | "avatarSeed">;

/**
 * Stand-ins for a deployment that has fewer than three public agents to show. Invented names on
 * purpose: they illustrate what a roster looks like without claiming any of these exist here.
 */
const AGENTS_PLACEHOLDER: RosterCard[] = [
  {
    id: "placeholder-research",
    name: "Research Analyst",
    avatarSeed: "research-analyst",
  },
  { id: "placeholder-data", name: "Data Analyst", avatarSeed: "data-analyst" },
  {
    id: "placeholder-support",
    name: "Support Agent",
    avatarSeed: "support-agent",
  },
];

function RosterStep() {
  const { data: agents } = useQuery(agentListQueryOptions());
  const explore =
    agents?.filter((a) => !a.mine && a.visibility === "public") ?? [];
  // Always three cards: real public agents first, placeholders topping up a sparse deployment.
  // slice past the end is just [], so a roster of three or more takes no placeholders at all.
  const roster: Array<RosterCard & { example?: boolean }> = [
    ...explore.slice(0, 3),
    ...AGENTS_PLACEHOLDER.slice(explore.length).map((placeholder) => ({
      ...placeholder,
      example: true,
    })),
  ];

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="text-3xl font-semibold tracking-tight max-w-md text-center">
        Choose from a variety of agents or create your own
      </h1>
      <div className="h-8" />
      <div className="w-full max-w-lg overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-4">
        {roster.map((a) => {
          return (
            <div
              key={a.id}
              // Dimmed and labelled, so an invented name never reads as a Bot this deployment has.
              className={`bg-card p-4 rounded-lg flex flex-row gap-4 items-center ${a.example ? "opacity-70" : ""}`}
            >
              <Avatar name={a.avatarSeed} size={40} />
              <div className="flex min-w-0 flex-col">
                <h3 className="line-clamp-1 text-base font-medium tracking-tight">
                  {a.name}
                </h3>
                {a.example ? (
                  <span className="text-xs text-muted-foreground">Example</span>
                ) : null}
              </div>
            </div>
          );
        })}
        <div className="bg-card p-4 rounded-lg flex flex-row gap-4 items-center">
          <div className="rounded-full size-[40px] border border-foreground/30 border-dashed" />
          <h3 className="line-clamp-1 text-base font-medium tracking-tight text-foreground/70">
            Your own agent
          </h3>
        </div>
      </div>
    </div>
  );
}

const DRIVE_STEP_KEY = "connect.onboarding.step";

/** Optional: Google Drive verbinden, damit alle Daten automatisch gesichert werden. Überspringbar. */
function DriveStep() {
  const status = useQuery({ queryKey: ["drive-backup", "status"], queryFn: fetchDriveBackupStatus, retry: false });
  const [error, setError] = React.useState<string | null>(null);
  const result = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("drive");
  const connected = status.data?.connected;
  return (
    <div className="w-full flex flex-col items-center justify-center">
      <h1 className="text-3xl font-semibold tracking-tight max-w-md text-center">Google Drive verbinden</h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
        Connect sichert deine Unternehmen, Agents, Chats, Einstellungen und das Brain verschlüsselt in deinem Google Drive
        (Ordner „Connect Backup“), automatisch bei jeder Änderung. Connect sieht dort nur seine eigenen Dateien.
      </p>
      <div className="h-8" />
      {connected ? (
        <p className="text-emerald-500 text-sm font-medium">
          ✓ Verbunden{status.data?.email ? ` mit ${status.data.email}` : ""}. Die erste Sicherung läuft.
        </p>
      ) : (
        <Button
          disabled={!status.data?.configured}
          onClick={() => {
            setError(null);
            window.sessionStorage.setItem(DRIVE_STEP_KEY, String(STEPS.length - 1));
            connectGoogleDrive("onboarding").catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
          }}
          size="lg"
          variant="outline"
        >
          Google Drive verbinden ↗
        </Button>
      )}
      {result === "failed" ? (
        <p className="mt-3 text-destructive text-sm">
          Verbinden hat nicht geklappt: {new URLSearchParams(window.location.search).get("reason") ?? "unbekannt"}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-destructive text-sm">{error}</p> : null}
      {status.data && !status.data.configured ? (
        <p className="mt-3 text-muted-foreground text-xs">Auf diesem Server ist die Drive-Sicherung nicht eingerichtet.</p>
      ) : null}
      <p className="mt-6 text-muted-foreground text-xs">Optional. Du kannst das jederzeit unter Einstellungen › Sicherung nachholen.</p>
    </div>
  );
}

const STEPS: Array<() => React.ReactNode> = [
  () => <WelcomeStep />,
  () => <ComputerUseStep />,
  () => <RosterStep />,
  () => <DriveStep />,
];

/** A pane arrives from the side the journey is moving toward, and leaves out the other. */
const variants = {
  initial: (direction: number) => ({ x: `${110 * direction}%`, opacity: 0 }),
  active: { x: "0%", opacity: 1 },
  exit: (direction: number) => ({ x: `${-110 * direction}%`, opacity: 0 }),
};

function RouteComponent() {
  const navigate = useNavigate();
  const complete = useMutation(completeOnboardingMutationOptions(queryClient));

  // Browser state on purpose: the step is not persisted while the wizard is being designed.
  // Back from Google's consent screen: resume on the Drive step instead of the start.
  const [step, setStep] = React.useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = Number(window.sessionStorage.getItem(DRIVE_STEP_KEY));
    window.sessionStorage.removeItem(DRIVE_STEP_KEY);
    const fromGoogle = new URLSearchParams(window.location.search).has("drive");
    return fromGoogle || (Number.isInteger(saved) && saved > 0) ? STEPS.length - 1 : 0;
  });
  const [direction, setDirection] = React.useState(1);
  // The way out: set once the completion is saved, it fades the whole page and then navigates.
  const [leaving, setLeaving] = React.useState(false);
  const [ref, bounds] = useMeasure();

  const last = step === STEPS.length - 1;

  const go = (to: number) => {
    setDirection(to > step ? 1 : -1);
    setStep(to);
  };

  return (
    // Outside `_app` on purpose: no sidebar and no chrome until onboarding is done.
    // The fade runs only after the completion is saved, so a failed save never fades a page the
    // person still needs — and navigation waits for the fade, so the home screen never pops in
    // over a half-faded wizard.
    <motion.div
      animate={{ opacity: leaving ? 0 : 1 }}
      className={`min-h-svh overflow-hidden flex flex-col items-center justify-center w-full ${leaving ? "pointer-events-none" : ""}`}
      initial={false}
      onAnimationComplete={() => {
        if (leaving) {
          navigate({ to: "/" });
        }
      }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <div className="mx-auto w-full max-w-2xl px-4">
        <MotionConfig transition={{ duration: 0.5, type: "spring", bounce: 0 }}>
          {/* The frame follows each pane's height, so the buttons glide instead of jumping. */}
          <motion.div
            animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}
            className="overflow-hidden"
          >
            <div ref={ref}>
              <AnimatePresence
                custom={direction}
                initial={false}
                mode="popLayout"
              >
                <motion.div
                  animate="active"
                  custom={direction}
                  exit="exit"
                  initial="initial"
                  key={step}
                  variants={variants}
                >
                  {STEPS[step]()}
                </motion.div>
              </AnimatePresence>

              {complete.error ? (
                <p className="mt-4 text-destructive text-sm" role="alert">
                  {complete.error.message}
                </p>
              ) : null}

              <motion.div
                className="mt-20 flex flex-col items-center justify-center max-w-xs gap-4 w-full mx-auto"
                layout
              >
                <Button
                  className="w-full"
                  disabled={complete.isPending}
                  onClick={() => {
                    if (last) {
                      complete.mutate(undefined, {
                        onSuccess: () => setLeaving(true),
                      });
                    } else {
                      go(step + 1);
                    }
                  }}
                  size="lg"
                >
                  {complete.isPending
                    ? "Saving…"
                    : last
                      ? "Get started"
                      : "Continue"}
                </Button>
                {step !== 0 && (
                  <Button
                    className="w-full"
                    onClick={() => go(step - 1)}
                    variant="secondary"
                    size="lg"
                  >
                    Back
                  </Button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </MotionConfig>
      </div>
    </motion.div>
  );
}
