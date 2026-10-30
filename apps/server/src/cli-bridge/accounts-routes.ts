import type { Hono as HonoApp } from "hono";
import {
  listAccounts,
  createAccount,
  activateAccount,
  deleteAccount,
  getAccount,
} from "./accounts/storage";
import { launchAccountById } from "./accounts/launcher";
import { previewPortFor } from "./accounts/app-cast";
import { listInstalledPcApps } from "./accounts/pc-apps";
import { auditCli } from "../agent-hub/remote-fs";

export function registerAccountsRoutes(app: HonoApp<any, any, any>): void {
  // GET /api/app-accounts (optionally ?app=codex)
  app.get("/api/app-accounts", (c) => {
    const appQuery = c.req.query("app");
    const accounts = listAccounts(appQuery);
    return c.json({
      ok: true,
      accounts: accounts.map((a) => ({
        id: a.id,
        userId: a.userId,
        provider: a.provider || a.app,
        app: a.app,
        accountName: a.accountName || a.label,
        label: a.label,
        email: a.email || undefined,
        avatarUrl: a.avatarUrl || undefined,
        isActive: a.isActive,
        dataDir: a.dataDir,
        companyId: a.companyId,
        metadata: a.metadata,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  });

  // GET /api/pc-apps?q= -> installierte Programme (Startmenue + bekannte Apps)
  // Fuer "App vom PC hinzufuegen": die Auswahl in der Sidebar kommt von hier.
  app.get("/api/pc-apps", (c) => {
    const query = (c.req.query("q") || "").trim().toLowerCase();
    const apps = listInstalledPcApps();
    const filtered = query
      ? apps.filter(
          (app) =>
            app.name.toLowerCase().includes(query) || app.path.toLowerCase().includes(query),
        )
      : apps;
    return c.json({ ok: true, apps: filtered.slice(0, 300) });
  });

  // POST /api/app-accounts
  app.post("/api/app-accounts", async (c) => {
    try {
      const body = await c.req.json();
      const appKey = body.app || body.provider;
      const label = body.label || body.accountName || `${appKey} Account`;
      if (!appKey) {
        return c.json({ ok: false, error: "Missing 'app' or 'provider' field" }, 400);
      }

      const created = createAccount({
        companyId: body.companyId,
        userId: body.userId,
        app: appKey,
        label,
        email: body.email,
        metadata: body.metadata,
      });

      return c.json({
        ok: true,
        account: {
          id: created.id,
          userId: created.userId,
          provider: created.provider,
          app: created.app,
          accountName: created.accountName,
          label: created.label,
          email: created.email,
          avatarUrl: created.avatarUrl,
          isActive: created.isActive,
          dataDir: created.dataDir,
          metadata: created.metadata,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      }, 201);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || "Invalid payload" }, 400);
    }
  });

  // POST /api/app-accounts/:id/activate
  app.post("/api/app-accounts/:id/activate", (c) => {
    const id = c.req.param("id");
    const updated = activateAccount(id);
    if (!updated) {
      return c.json({ ok: false, error: `Account ${id} not found` }, 404);
    }
    return c.json({ ok: true, account: updated });
  });

  // POST /api/app-accounts/:id/launch
  // helium-appcast: startet mit Debug-Port (Live-Vorschau). Body {restart:true} schliesst eine schon
  // laufende Instanz OHNE Vorschau - nur nach ausdruecklichem Klick auf "Neu mit Vorschau starten".
  app.post("/api/app-accounts/:id/launch", async (c) => {
    const id = c.req.param("id");
    let restart = false;
    try {
      const body = (await c.req.json()) as { restart?: unknown };
      restart = body?.restart === true;
    } catch {}
    auditCli(c.req.raw, null, restart ? "apps.launch.restart" : "apps.launch", { accountId: id });
    const result = await launchAccountById(id, { restart });
    const status = result.ok || result.needsRestart ? 200 : 500;
    return c.json(result, status);
  });

  // GET /api/app-accounts/:id/preview -> laeuft die Instanz mit Live-Vorschau?
  app.get("/api/app-accounts/:id/preview", async (c) => {
    const account = getAccount(c.req.param("id"));
    if (!account) return c.json({ ok: false, error: "not found" }, 404);
    const port = await previewPortFor(account);
    return c.json({ ok: true, preview: Boolean(port) });
  });

  // DELETE /api/app-accounts/:id
  app.delete("/api/app-accounts/:id", (c) => {
    const id = c.req.param("id");
    const ok = deleteAccount(id);
    return c.json({ ok, id });
  });
}

export default registerAccountsRoutes;
