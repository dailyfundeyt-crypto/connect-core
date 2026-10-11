/** Lokaler Connect-Server (3101): Status der Handy-Brücke für Einstellungen › Anbieter-CLIs. */
import { pcBridgeWorkerState } from "./worker";

type Ctx = { json: (body: unknown, status?: number) => Response };
type Handler = (context: Ctx, next: () => Promise<void>) => Promise<Response | void>;
type AppLike = { get: (path: string, ...handlers: Handler[]) => unknown };

export function installLocalPcBridgeRoutes(app: AppLike, requireUser: Handler) {
  app.get("/api/pc-bridge/status", requireUser, async (context) => context.json({ mode: "local", worker: pcBridgeWorkerState() }));
}
