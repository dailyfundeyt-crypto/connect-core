import { IconMailForward } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { getAgentIdentity } from "@/lib/agents/agent-identity";
import {
  forwardManusMail,
  listManusAliases,
  listManusMails,
  setManusAlias,
  subscribeManusMail,
  type MailMessage,
} from "@/lib/agents/manus-mail";
import { manusFeaturesEnabled } from "@/lib/agents/model-provider-dispatch";
import { subscribeModelProvider } from "@/lib/agents/model-provider";
import { subscribeAgentApiKeys } from "@/lib/agents/agent-api-keys";

/**
 * Assign mailbox names/emails to this agent — only when Manus key is present
 * (Plan 047 key gate). No simulate/ingest UI.
 */
export function ManusMailPanel({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const identity = getAgentIdentity(agentId);
  const [aliasName, setAliasName] = useState(agentName);
  const [aliasEmail, setAliasEmail] = useState(
    identity.email ||
      `${agentName.toLowerCase().replace(/\s+/g, ".")}@manus.mail`,
  );
  const [mails, setMails] = useState<MailMessage[]>(() => listManusMails());
  const [aliases, setAliases] = useState(() => listManusAliases());
  const [notice, setNotice] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(() => manusFeaturesEnabled(agentId));

  useEffect(() => {
    setAliasName(agentName);
    const id = getAgentIdentity(agentId);
    setAliasEmail(
      id.email ||
        `${agentName.toLowerCase().replace(/\s+/g, ".")}@manus.mail`,
    );
    setMails(listManusMails());
    setAliases(listManusAliases());
    const refreshGate = () => setEnabled(manusFeaturesEnabled(agentId));
    refreshGate();
    const offMail = subscribeManusMail(() => {
      setMails(listManusMails());
      setAliases(listManusAliases());
    });
    const offProv = subscribeModelProvider(refreshGate);
    const offKeys = subscribeAgentApiKeys(refreshGate);
    return () => {
      offMail();
      offProv();
      offKeys();
    };
  }, [agentId, agentName]);

  const mine = useMemo(
    () =>
      mails.filter(
        (m) =>
          m.assignedAgentId === agentId ||
          (!m.assignedAgentId &&
            aliases.some(
              (a) =>
                a.agentId === agentId &&
                (a.email === m.to.toLowerCase() ||
                  a.email === m.from.toLowerCase()),
            )),
      ),
    [mails, agentId, aliases],
  );

  if (!enabled) {
    return (
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Mail Manus</ItemTitle>
          <ItemDescription>
            Deaktiviert — kein Manus-API-Key oder Model Provider nicht auf
            Manus (API-Key / Terminal·Manus). Key unter Settings → Model
            Provider speichern.
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  }

  const myAlias = aliases.find((a) => a.agentId === agentId);

  const saveAlias = () => {
    const next = setManusAlias({
      mailboxName: aliasName.trim() || agentName,
      email: aliasEmail.trim(),
      agentId,
    });
    setAliases(next);
    setNotice(
      `Mailbox „${aliasName.trim() || agentName}“ (${aliasEmail.trim()}) → ${agentName}`,
    );
  };

  const forward = (mailId: string) => {
    const mail = forwardManusMail(mailId);
    setMails(listManusMails());
    if (mail?.assignedAgentId) {
      setNotice(
        `An Manus/Chat weitergeleitet für ${mail.assignedAgentName}.`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Manus Mail-Routing</ItemTitle>
          <ItemDescription>
            E-Mails aus dem Speicher bestimmten Agenten zuweisen — gleicher Name
            wie angegeben. Treffer gehen automatisch in den Chat / Manus-CLI.
          </ItemDescription>
        </ItemContent>
      </Item>

      <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">
          Zuweisung (Name = Mail-Speicher)
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="h-8 min-w-[8rem] flex-1"
            onChange={(e) => setAliasName(e.target.value)}
            placeholder="Name im Mail-Speicher"
            value={aliasName}
          />
          <Input
            className="h-8 min-w-[10rem] flex-1"
            onChange={(e) => setAliasEmail(e.target.value)}
            placeholder="email@…"
            type="email"
            value={aliasEmail}
          />
          <Button onClick={saveAlias} size="sm" type="button">
            Speichern
          </Button>
        </div>
        {myAlias ? (
          <p className="text-[11px] text-muted-foreground">
            Aktiv: {myAlias.mailboxName} · {myAlias.email}
          </p>
        ) : null}
      </div>

      {notice ? (
        <p className="px-1 text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}

      {mine.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {mine.map((mail) => (
            <li
              className="flex items-start justify-between gap-2 px-3 py-2"
              key={mail.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{mail.subject}</p>
                <p className="text-[11px] text-muted-foreground">
                  {mail.from} → {mail.to}
                  {mail.assignedAgentName
                    ? ` · ${mail.assignedAgentName}`
                    : ""}
                  {mail.forwarded ? " · gesendet" : ""}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                  {mail.body}
                </p>
              </div>
              {!mail.forwarded && mail.assignedAgentId === agentId ? (
                <Button
                  className="gap-1 shrink-0"
                  onClick={() => forward(mail.id)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <IconMailForward className="size-4" />
                  An Chat
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-[11px] text-muted-foreground">
          Noch keine Mails für diesen Agenten.
        </p>
      )}
    </div>
  );
}
