// Nur-Lese-Vorschau fuer Screenshots: liefert die gebaute App + Brain-Daten direkt aus den Dateien.
// Kein Login, kein Schreiben (alle Aenderungen -> 403), keine Routinen, Port 3199 nur auf 127.0.0.1.
import * as path from "node:path";
import { existsSync } from "node:fs";
import { accessFor, dashboard } from "../../apps/server/src/brain/maps";
import { listAllMarkdown, readMarkdown } from "../../apps/server/src/brain/store";
const root = process.env.CONNECT_BRAIN_VAULT_PATH!;
const dist = path.resolve(import.meta.dir, "../../apps/app/dist");
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
Bun.serve({
  port: 3199,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p.startsWith("/api/")) {
      if (req.method !== "GET") return json({ error: "Vorschau: nur lesen" }, 403);
      if (p === "/api/me") return json({ user: { id: "shot", email: "stefan@local", name: "Stefan Kunc", image: null, roles: ["admin"], isAdmin: true, onboarding: null } });
      if (p === "/api/brain/maps") return json(await dashboard(root));
      if (p === "/api/brain/tree") return json({ available: true, files: await listAllMarkdown(root) });
      if (p === "/api/brain/access") return json({ available: true, ...(await accessFor(root, url.searchParams.get("path") ?? "")) });
      if (p === "/api/brain/file") return json({ available: true, file: await readMarkdown(root, url.searchParams.get("path") ?? "") });
      if (p === "/api/brain/status") return json({ available: true, path: root, vaultPath: root, files: 1, vaultFiles: 1, head: null });
      return json({}, 404);
    }
    const file = path.join(dist, p);
    if (p !== "/" && existsSync(file) && !file.endsWith(path.sep)) return new Response(Bun.file(file));
    return new Response(Bun.file(path.join(dist, "index.html")));
  },
});
console.log("shot-server 3199");
