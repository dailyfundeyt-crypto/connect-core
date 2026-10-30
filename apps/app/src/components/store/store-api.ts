/**
 * Store API Client (Lane 8)
 * Connects to /api/store endpoints with graceful fallback.
 */

import type { StoreItem } from "@connect/contracts/api";
import type {
  StoreCategoryItem,
  StoreItemDetail,
  StoreReviewSummary,
} from "./types";

const API_BASE = "/api/store";

export async function fetchStoreItems(params?: {
  category?: string;
  type?: string;
  search?: string;
  companyId?: string;
}): Promise<{ items: StoreItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.type) query.set("type", params.type);
  if (params?.search) query.set("search", params.search);
  if (params?.companyId) query.set("companyId", params.companyId);

  try {
    const res = await fetch(`${API_BASE}/items?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      return { items: data.items || [], total: data.total || 0 };
    }
  } catch {
    // Graceful fallback
  }

  return { items: [], total: 0 };
}

export async function fetchStoreItem(
  id: string,
  companyId?: string,
): Promise<StoreItemDetail | null> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  try {
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}${query}`);
    if (res.ok) {
      const data = await res.json();
      return data.item || null;
    }
  } catch {
    // Graceful fallback
  }
  return null;
}

export async function installStoreItem(
  id: string,
  companyId: string,
  permissions?: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, permissions }),
    });
    const data = await res.json();
    return { success: Boolean(data.ok), error: data.error };
  } catch (err: any) {
    return { success: false, error: err?.message || "Installationsanfrage fehlgeschlagen" };
  }
}

export async function uninstallStoreItem(
  id: string,
  companyId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}/uninstall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    const data = await res.json();
    return { success: Boolean(data.ok), error: data.error };
  } catch (err: any) {
    return { success: false, error: err?.message || "Deinstallation fehlgeschlagen" };
  }
}

export async function toggleStoreAutoStart(
  id: string,
  companyId: string,
  autoStart: boolean,
): Promise<{ success: boolean; autoStart: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}/auto-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, autoStart }),
    });
    const data = await res.json();
    return { success: Boolean(data.ok), autoStart: Boolean(data.autoStart) };
  } catch {
    return { success: false, autoStart };
  }
}

export async function publishStoreItem(payload: {
  manifest: unknown;
  changelog?: string;
  author?: string;
}): Promise<{ success: boolean; item?: StoreItemDetail; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return { success: Boolean(data.ok), item: data.item, error: data.error };
  } catch (err: any) {
    return { success: false, error: err?.message || "Veröffentlichung fehlgeschlagen" };
  }
}

export async function submitStoreReview(
  id: string,
  review: { rating: number; comment: string; userId?: string; userName?: string },
): Promise<{ success: boolean; review?: StoreReviewSummary; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/items/${encodeURIComponent(id)}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(review),
    });
    const data = await res.json();
    return { success: Boolean(data.ok), review: data.review, error: data.error };
  } catch (err: any) {
    return { success: false, error: err?.message || "Bewertung fehlgeschlagen" };
  }
}

export async function fetchStoreCategories(): Promise<StoreCategoryItem[]> {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    if (res.ok) {
      const data = await res.json();
      return data.categories || [];
    }
  } catch {
    // Fallback
  }
  return [
    { id: "all", label: "Alle Kategorien", count: 0, description: "Alle Store-Inhalte" },
    { id: "mcps", label: "MCPs", count: 0, description: "Model Context Protocol Server" },
    { id: "tools", label: "Tools & Apps", count: 0, description: "Module & Tools" },
    { id: "skills", label: "Skills", count: 0, description: "Agenten-Fertigkeiten" },
    { id: "companys", label: "Companys", count: 0, description: "Workspaces" },
  ];
}
