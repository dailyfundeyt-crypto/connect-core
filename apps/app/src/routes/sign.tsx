import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProviderLogo } from "@/components/auth/provider-logo";
import { PremiumLanding } from "@/components/landing/premium-landing";
import {
  providerName,
  signInWith,
  signInWithEmailDomain,
} from "@/lib/auth/client";
import {
  type AuthProviderId,
  authProvidersQueryOptions,
  currentUserQueryOptions,
} from "../lib/auth/queries";


export const Route = createFileRoute("/sign")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      currentUserQueryOptions(),
    );
    if (user) {
      throw redirect({ to: "/" });
    }
    // Loaded here so the screen paints with its buttons rather than painting empty and then
    // growing them, which reads as "no providers" for exactly as long as the request takes.
    await context.queryClient.ensureQueryData(authProvidersQueryOptions());
  },
  component: SignScreen,
});

function SignScreen() {
  // Which provider is being opened, rather than whether one is: with three buttons, a single
  // boolean would put "Opening…" on all of them.
  const [opening, setOpening] = useState<AuthProviderId | "sso" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: options } = useQuery(authProvidersQueryOptions());
  const navigate = useNavigate();
  const { data: user } = useQuery({
    ...currentUserQueryOptions(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const providers = options?.providers ?? [];
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (user) void navigate({ to: "/", replace: true });
  }, [navigate, user]);

  /**
   * Sign in through whichever identity provider covers this address.
   *
   * No password is asked for and none is checked here: only the part after the @ is used, to decide
   * which registered provider to hand somebody to.
   */
  async function handleDomainSignIn(submission: React.FormEvent) {
    submission.preventDefault();
    setError(null);
    setOpening("sso");

    try {
      await signInWithEmailDomain(email);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No identity provider is registered for that address.",
      );
      setOpening(null);
    }
  }

  async function handleSignIn(provider: AuthProviderId) {
    setError(null);
    setOpening(provider);

    try {
      await signInWith(provider);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : `Could not start ${providerName(provider)} sign-in.`,
      );
      setOpening(null);
    }
  }

  /*
   * Premium-Startseite (connect-premium): Besucher ohne Anmeldung sehen zuerst die Landingpage,
   * die Anmeldung sitzt im Hero und am Ende. Gleiche Handler wie vorher (Google, SSO, Fehler).
   */
  const label = (provider: AuthProviderId) =>
    opening === provider
      ? `${providerName(provider)} wird geöffnet …`
      : `Mit ${providerName(provider)} fortfahren`;

  const signIn = (
    <div className="flex w-full flex-col gap-2.5">
      {providers.map((provider) => (
        <button
          className="cxl-cta"
          disabled={opening !== null}
          key={provider}
          onClick={() => handleSignIn(provider)}
          type="button"
        >
          <ProviderLogo provider={provider} />
          <span>{label(provider)}</span>
        </button>
      ))}
      {providers.length === 0 && !options?.sso ? (
        <p className="text-center text-sm text-white/50">
          Für diese Installation ist keine Anmeldung eingerichtet.
        </p>
      ) : null}
      {options?.sso ? (
        <form className="mt-1 flex flex-col gap-2" onSubmit={handleDomainSignIn}>
          <input
            autoComplete="email"
            className="cxl-input"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="du@firma.de"
            required
            type="email"
            value={email}
          />
          <button
            className="cxl-ghost"
            disabled={opening !== null || email.trim().length === 0}
            type="submit"
          >
            {opening === "sso" ? "Wird geöffnet …" : "Mit Firmenkonto fortfahren"}
          </button>
        </form>
      ) : null}
    </div>
  );

  const first = providers[0];
  const signInCompact = first ? (
    <button
      className="cxl-cta-sm"
      disabled={opening !== null}
      onClick={() => handleSignIn(first)}
      type="button"
    >
      Anmelden
    </button>
  ) : null;

  return (
    <PremiumLanding
      error={error}
      signIn={signIn}
      signInCompact={signInCompact}
    />
  );
}
