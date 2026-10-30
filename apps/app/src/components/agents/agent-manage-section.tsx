import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  deleteAgentMutationOptions,
  duplicateAgentMutationOptions,
  setAgentHiddenMutationOptions,
} from "@/lib/agents/mutations";
import type { AgentProfile } from "@/lib/agents/queries";

export function AgentManageRegister({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const setHidden = useMutation(setAgentHiddenMutationOptions(queryClient));
  const duplicateAgent = useMutation(
    duplicateAgentMutationOptions(queryClient),
  );
  const deleteAgent = useMutation(deleteAgentMutationOptions(queryClient));
  const actionError = setHidden.error ?? duplicateAgent.error;

  return (
    <>
      {/* The same gap the General items keep, so the two screens read as one list style. */}
      <div className="flex flex-col gap-2">
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>{profile.hidden ? "Hidden" : "Hide"}</ItemTitle>
            <ItemDescription>
              {profile.hidden
                ? "Hidden from your agents list. This changes nothing for anyone else."
                : "Take it off your agents list. This changes nothing for anyone else."}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              disabled={setHidden.isPending}
              onClick={async () => {
                await setHidden.mutateAsync({
                  agentId,
                  hidden: !profile.hidden,
                });
                if (!profile.hidden)
                  await navigate({ search: {}, to: "/agents" });
              }}
              size="sm"
              variant="outline"
            >
              {setHidden.isPending
                ? profile.hidden
                  ? "Unhiding…"
                  : "Hiding…"
                : profile.hidden
                  ? "Unhide"
                  : "Hide"}
            </Button>
          </ItemActions>
        </Item>

        <Item variant="muted">
          <ItemContent>
            <ItemTitle>Duplicate</ItemTitle>
            <ItemDescription>
              A copy of your own, with no key and no channels.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              disabled={duplicateAgent.isPending}
              onClick={async () => {
                const copy = await duplicateAgent.mutateAsync(agentId);
                await navigate({ search: { agent: copy.id }, to: "/agents" });
              }}
              size="sm"
              variant="outline"
            >
              {duplicateAgent.isPending ? "Duplicating…" : "Duplicate"}
            </Button>
          </ItemActions>
        </Item>

        {profile.canManage ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>Delete</ItemTitle>
              <ItemDescription>This cannot be undone.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                onClick={() => setConfirmingDelete(true)}
                size="sm"
                variant="destructive"
              >
                Delete
              </Button>
            </ItemActions>
          </Item>
        ) : null}
      </div>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError.message}
        </p>
      ) : null}

      {/* Stacked over the agent dialog: destroying something deserves its own moment, and the
          question keeps the name in it so the wrong tab cannot delete the wrong coworker. */}
      <Dialog
        onOpenChange={(next) => !next && setConfirmingDelete(false)}
        open={confirmingDelete}
      >
        <DialogContent
          className="max-w-sm"
          overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-sm"
        >
          <DialogHeader>
            <DialogTitle>Delete {profile.name}?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteAgent.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {deleteAgent.error.message}
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              onClick={() => setConfirmingDelete(false)}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteAgent.isPending}
              onClick={async () => {
                await deleteAgent.mutateAsync(agentId);
                await navigate({ search: {}, to: "/agents" });
              }}
              size="sm"
              variant="destructive"
            >
              {deleteAgent.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
