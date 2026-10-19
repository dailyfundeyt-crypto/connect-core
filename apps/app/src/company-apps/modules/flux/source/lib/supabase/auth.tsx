import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Profile } from "./types";

const STORAGE_KEY = "flux_supabase_credentials";

export type SupabaseCredentials = {
  url: string;
  anonKey: string;
};

export type AuthStatus =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "signed_in"; user: User; profile: Profile | null };

type AuthContextValue = {
  credentials: SupabaseCredentials | null;
  client: SupabaseClient | null;
  status: AuthStatus;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveCredentials: (creds: SupabaseCredentials) => void;
  clearCredentials: () => void;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
type ConnectIdentity = { id: string; email: string; name: string | null; image: string | null };
const ConnectIdentityContext = createContext<ConnectIdentity | null>(null);

export function ConnectAuthBridge({ identity, children }: { identity: ConnectIdentity | null; children: ReactNode }) {
  return <ConnectIdentityContext.Provider value={identity}>{children}</ConnectIdentityContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const connectIdentity = useContext(ConnectIdentityContext);
  const [credentials, setCredentials] = useState<SupabaseCredentials | null>(() => connectIdentity ? null : loadStoredCredentials());
  // Initial state: if we have no stored credentials we know immediately that we are signed out.
  // Otherwise stay in 'loading' until the Supabase client reports a session.
  const [status, setStatus] = useState<AuthStatus>(() =>
    connectIdentity || (typeof window !== "undefined" && !loadStoredCredentials()) ? { kind: "signed_out" } : { kind: "loading" },
  );
  const [error, setError] = useState<string | null>(null);
  const credentialsRef = useRef<SupabaseCredentials | null>(credentials);

  useEffect(() => {
    credentialsRef.current = credentials;
  }, [credentials]);

  const client = useMemo(() => {
    if (!credentials) return null;
    return createClient(credentials.url, credentials.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }, [credentials]);

  const persistCredentials = (creds: SupabaseCredentials | null) => {
    if (creds) localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
    else localStorage.removeItem(STORAGE_KEY);
    setCredentials(creds);
  };

  const loadProfile = async (c: SupabaseClient, userId: string): Promise<Profile | null> => {
    const { data, error } = await c.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) return null;
    return data as Profile | null;
  };

  const refreshProfile = async () => {
    const c = client;
    if (!c) return;
    const { data: sessionData } = await c.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;
    const profile = await loadProfile(c, user.id);
    setStatus({ kind: "signed_in", user, profile });
  };

  // Listen for auth state changes (covers Google OAuth redirect)
  useEffect(() => {
    if (!client) {
      setStatus({ kind: "loading" });
      return;
    }
    let cancelled = false;

    const { data: subscription } = client.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      if (!session?.user) {
        setStatus({ kind: "signed_out" });
        return;
      }
      const profile = await loadProfile(client, session.user.id);
      if (!cancelled) setStatus({ kind: "signed_in", user: session.user, profile });
    });

    void (async () => {
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      if (!data.session?.user) {
        setStatus({ kind: "signed_out" });
        return;
      }
      const profile = await loadProfile(client, data.session.user.id);
      if (!cancelled) setStatus({ kind: "signed_in", user: data.session.user, profile });
    })();

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const signInWithGoogle = async () => {
    if (!client) {
      setError("Bitte zuerst Supabase-Credentials hinterlegen.");
      return;
    }
    setError(null);
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const options: { redirectTo?: string; scopes?: string; queryParams?: { [k: string]: string }; skipBrowserRedirect?: boolean } = {};
    if (redirectTo) options.redirectTo = redirectTo;
    const { error: oauthError } = await client.auth.signInWithOAuth({
      provider: "google",
      options,
    });
    if (oauthError) setError(oauthError.message);
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (!client) {
      setError("Bitte zuerst Supabase-Credentials hinterlegen.");
      return;
    }
    setError(null);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
  };

  const signUp = async (email: string, password: string) => {
    if (!client) {
      setError("Bitte zuerst Supabase-Credentials hinterlegen.");
      return;
    }
    setError(null);
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const options: { emailRedirectTo?: string } = {};
    if (redirectTo) options.emailRedirectTo = redirectTo;
    const { error: signUpError } = await client.auth.signUp({ email, password, options });
    if (signUpError) setError(signUpError.message);
  };

  const signOut = async () => {
    if (!client) return;
    setError(null);
    await client.auth.signOut();
    setStatus({ kind: "signed_out" });
  };

  const value: AuthContextValue = {
    credentials,
    client,
    status,
    signInWithGoogle,
    signInWithPassword,
    signUp,
    signOut,
    refreshProfile,
    saveCredentials: persistCredentials,
    clearCredentials: () => persistCredentials(null),
    error,
  };

  if (connectIdentity) {
    const user = {
      id: connectIdentity.id,
      email: connectIdentity.email,
      user_metadata: { full_name: connectIdentity.name, avatar_url: connectIdentity.image },
    } as User;
    return (
      <AuthContext.Provider value={{
        ...value,
        status: { kind: "signed_in", user, profile: null },
        signInWithGoogle: async () => {},
        signInWithPassword: async () => {},
        signUp: async () => {},
        signOut: async () => {},
      }}>
        {children}
      </AuthContext.Provider>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

function loadStoredCredentials(): SupabaseCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.url === "string" && typeof parsed?.anonKey === "string") return parsed;
  } catch {
    // Vercel environment credentials below are also available during SSR.
  }
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
  const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return configuredUrl && configuredAnonKey ? { url: configuredUrl, anonKey: configuredAnonKey } : null;
}

export type { Session };
