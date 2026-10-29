/** Connect Social (helium-social): Einstieg für app.ts der lokalen App. */
import { localSocialBackend } from "./local";
import { installSocialRoutes, type SocialAppLike, type SocialBackend } from "./routes";

export type { SocialBackend };
export { localSocialBackend };

export function installLocalSocialRoutes(
  app: unknown,
  requireUser: unknown,
  backend: SocialBackend = localSocialBackend(),
) {
  installSocialRoutes(app as SocialAppLike, requireUser as never, backend);
}
