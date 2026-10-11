import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { authKeys } from "./queries";

/**
 * End the session.
 *
 * The empty JSON body is not decoration: better-auth refuses a POST without
 * `content-type: application/json` (415 UNSUPPORTED_MEDIA_TYPE). The local server tolerated it,
 * the online one did not, so "Abmelden" silently failed on the Vercel/Handy version.
 * One retry covers a transient 5xx (e.g. the database pool being briefly full).
 */
async function signOut() {
  try {
    await client("/api/auth/sign-out", {
      method: "POST",
      body: {},
      fallback: "Could not sign out",
    });
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      await client("/api/auth/sign-out", {
        method: "POST",
        body: {},
        fallback: "Could not sign out",
      });
    } catch {
      throw firstError;
    }
  }
}

export function signOutMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.setQueryData(authKeys.currentUser(), null);
      queryClient.removeQueries({ queryKey: authKeys.all });
    },
  });
}

/**
 * After the session is gone, load the sign-in page fresh (premium landing + Google login).
 * A full page load rather than a client navigation, so no in-memory state of the signed-in
 * person (queries, Copilot run, open sheets) survives into the landing page.
 */
export function goToSignInAfterSignOut() {
  window.location.replace("/sign");
}
