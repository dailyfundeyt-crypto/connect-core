/** Connect Social (helium-social): Einstieg für app.ts der lokalen App. */
import { localSocialBackend } from "./local";
import { installSocialRoutes, type SocialAppLike, type SocialBackend } from "./routes";
import { registerLane5SocialRoutes } from "./lane5-routes";

export type { SocialBackend };
export { localSocialBackend };

export function installLocalSocialRoutes(
  app: unknown,
  requireUser: unknown,
  backend: SocialBackend = localSocialBackend(),
) {
  // Lane 5: Swarm-v2 REST API Endpoints (/api/social/posts, /api/social/media, /api/social/articles, /api/social/listings, /api/social/company/:id)
  registerLane5SocialRoutes(app as any);
  installSocialRoutes(app as SocialAppLike, requireUser as never, backend);
}
