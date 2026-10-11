import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { goToSignInAfterSignOut, signOutMutationOptions } from "./mutations";

/** The one "Abmelden" action: end the session, then land on /sign. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const mutation = useMutation(signOutMutationOptions(queryClient));
  const { mutateAsync } = mutation;

  const signOut = useCallback(async () => {
    try {
      await mutateAsync();
    } catch {
      window.alert("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
      return;
    }
    goToSignInAfterSignOut();
  }, [mutateAsync]);

  return { signOut, isPending: mutation.isPending };
}
