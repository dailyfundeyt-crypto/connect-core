import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import {
  ensureAgentIdentity,
  formatSlackHandle,
  getAgentIdentity,
  setAgentIdentity,
  subscribeAgentIdentities,
  suggestAgentEmail,
  suggestSlackHandle,
  type AgentIdentity,
} from "@/lib/agents/agent-identity";
import { setManusAlias } from "@/lib/agents/manus-mail";

/**
 * Slack handle + email for this bot — identity for Slack-style agent group chats
 * and Manus mail routing.
 */
export function AgentIdentitySettings({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [identity, setIdentity] = useState<AgentIdentity>(() =>
    ensureAgentIdentity(agentId, agentName),
  );
  const [draft, setDraft] = useState(identity);

  useEffect(() => {
    const next = ensureAgentIdentity(agentId, agentName);
    setIdentity(next);
    setDraft(next);
    return subscribeAgentIdentities(() => {
      const refreshed = getAgentIdentity(agentId);
      setIdentity(refreshed);
      setDraft(refreshed);
    });
  }, [agentId, agentName]);

  const dirty =
    draft.slackHandle !== identity.slackHandle ||
    draft.email !== identity.email;

  const save = (nextDraft: AgentIdentity = draft) => {
    const saved = setAgentIdentity(agentId, nextDraft);
    setIdentity(saved);
    setDraft(saved);
    if (saved.email) {
      setManusAlias({
        mailboxName: agentName,
        email: saved.email,
        agentId,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Slack</ItemTitle>
          <ItemDescription>
            Eigenes Handle für Gruppenchats — andere Bots erreichen diesen mit{" "}
            {formatSlackHandle(draft.slackHandle) || "@…"} wie in Slack.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">@</span>
            <Input
              className="h-8 w-40"
              onChange={(e) =>
                setDraft((d) => ({ ...d, slackHandle: e.target.value }))
              }
              placeholder={suggestSlackHandle(agentName)}
              value={draft.slackHandle}
            />
          </div>
        </ItemActions>
      </Item>
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>E-Mail</ItemTitle>
          <ItemDescription>
            Eigene Adresse für Mail und Manus — gleicher Name wie im Speicher
            weist Nachrichten diesem Bot zu.
          </ItemDescription>
        </ItemContent>
        <ItemActions className="flex flex-col items-end gap-1">
          <Input
            className="h-8 w-56"
            onChange={(e) =>
              setDraft((d) => ({ ...d, email: e.target.value }))
            }
            placeholder={suggestAgentEmail(agentName)}
            type="email"
            value={draft.email}
          />
        </ItemActions>
      </Item>
      <div className="flex flex-wrap justify-end gap-2">
        {!draft.slackHandle || !draft.email ? (
          <Button
            onClick={() => {
              const next = {
                slackHandle:
                  draft.slackHandle || suggestSlackHandle(agentName),
                email: draft.email || suggestAgentEmail(agentName),
              };
              setDraft(next);
              save(next);
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            Automatisch zuweisen
          </Button>
        ) : null}
        {dirty ? (
          <Button onClick={() => save()} size="sm" type="button">
            Speichern
          </Button>
        ) : null}
      </div>
    </div>
  );
}
