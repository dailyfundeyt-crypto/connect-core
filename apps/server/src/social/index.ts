/** Connect Social (helium-social): Einstieg für app.ts der lokalen App. */
import { localSocialBackend } from "./local";
import { installSocialRoutes, type SocialAppLike } from "./routes";

export function installLocalSocialRoutes(app: unknown, requireUser: unknown) {
  installSocialRoutes(app as SocialAppLike, requireUser as never, localSocialBackend());
}
