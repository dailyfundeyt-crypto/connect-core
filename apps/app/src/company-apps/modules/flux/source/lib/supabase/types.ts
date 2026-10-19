export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  theme: "light" | "dark" | "system" | null;
  created_at: string;
  updated_at: string;
};

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; at: number }
  | { kind: "error"; message: string };
