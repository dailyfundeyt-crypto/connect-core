import { IconMail, IconPencil } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { AgentAutomationsPanel } from "@/components/agents/agent-automations-panel";
import { AgentIdentitySettings } from "@/components/agents/agent-identity-settings";
import { AgentModelPicker } from "@/components/agents/agent-model-picker";
import { AgentShellSettings } from "@/components/agents/agent-shell-settings";
import { CloudComputerPanel } from "@/components/agents/cloud-computer-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type AgentModelFamily,
  getAgentModelFamily,
  PRIMARY_MODEL_FAMILIES,
  setAgentModelFamily,
  subscribeAgentModels,
} from "@/lib/agents/agent-models";
import {
  clearBotAvatarOverride,
  fileToAvatarDataUrl,
  hasBotAvatarOverride,
  setBotAvatarOverride,
} from "@/lib/agents/connect-avatars";
import { agentFormSchema } from "@/lib/agents/form";
import {
  type AgentProfile,
  codexAccountsQueryOptions,
} from "@/lib/agents/queries";
import { useAgentPatch } from "@/lib/agents/use-agent-patch";
import { isComposing } from "@/lib/composing";
import { cn } from "@/lib/utils";

export function AgentGeneralRegister({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const navigate = useNavigate();
  const save = useAgentPatch(agentId, profile);

  return (
    <>
      {/* Each stands on its own — muted, not bg-card, which is invisible against a popup — and
          each edits in place: the field somebody wants to change is the only one that opens. */}
      <div className="flex flex-col gap-2">
        <ProfilePhotoItem agentId={agentId} profile={profile} />
        <EditableTextItem
          canManage={profile.canManage}
          label="Name"
          onSave={(name) => save({ name })}
          schema={agentFormSchema.shape.name}
          value={profile.name}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Title"
          onSave={(title) => save({ title })}
          schema={agentFormSchema.shape.title}
          value={profile.title}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Role"
          multiline
          onSave={(roleDescription) => save({ roleDescription })}
          schema={agentFormSchema.shape.roleDescription}
          value={profile.roleDescription}
        />
        {profile.systemOwned ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>System owned</ItemTitle>
              <ItemDescription>
                Ships with this deployment rather than belonging to a person.
              </ItemDescription>
            </ItemContent>
          </Item>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Identitäten
        </p>
        <AgentIdentitySettings agentId={agentId} agentName={profile.name} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          CLI-Konto & Config (Mehrkonten-Software)
        </p>
        <AgentAccountSettings
          agentId={agentId}
          currentEmail={profile.accountEmail}
          canManage={profile.canManage}
          onSave={(accountEmail) => save({ accountEmail })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Modell
        </p>
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle>Agent family</ItemTitle>
            <ItemDescription>
              Model One (Manus / ZGPT) oder Model Two (Hermes). Global unter
              Settings → Model Provider. Weitere Anbieter unter Beta.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <AgentFamilySelect agentId={agentId} />
          </ItemActions>
        </Item>
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle>Chat model</ItemTitle>
            <ItemDescription>
              Default model when chatting with this bot.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <AgentModelPicker
              agentId={agentId}
              showProvider
              size="default"
            />
          </ItemActions>
        </Item>
      </div>

      <AgentShellSettings agentId={agentId} agentName={profile.name} />

      {/* Engine and app instances live in the Arbeitsbereich register, next to the other tools. */}
      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Cloud-Computer
        </p>
        <CloudComputerPanel agentId={agentId} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Automatisierungen
        </p>
        <AgentAutomationsPanel agentId={agentId} />
      </div>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Gespräch öffnen</ItemTitle>
          <ItemDescription>
            Das eine, dauerhafte Gespräch mit diesem Agenten.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            onClick={() =>
              void navigate({
                params: { agentId },
                to: "/agent/$agentId",
              })
            }
            size="sm"
          >
            Öffnen
          </Button>
        </ItemActions>
      </Item>
    </>
  );
}

function AgentFamilySelect({ agentId }: { agentId: string }) {
  const [family, setFamily] = useState<AgentModelFamily>(() =>
    getAgentModelFamily(agentId),
  );
  useEffect(() => {
    setFamily(getAgentModelFamily(agentId));
    return subscribeAgentModels(() =>
      setFamily(getAgentModelFamily(agentId)),
    );
  }, [agentId]);

  return (
    <Select
      onValueChange={(value) => {
        if (typeof value !== "string") return;
        setFamily(
          setAgentModelFamily(agentId, value as AgentModelFamily, {
            syncCli: true,
            resetModel: true,
          }),
        );
      }}
      value={family}
    >
      <SelectTrigger aria-label="Agent family" className="h-8 min-w-36" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Standard</SelectLabel>
          {PRIMARY_MODEL_FAMILIES.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * Profile photo: Connect default under /bots, or a user-uploaded image (localStorage).
 */
function ProfilePhotoItem({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  const custom = hasBotAvatarOverride(agentId);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setBotAvatarOverride(agentId, dataUrl);
      bump((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Item className="items-center gap-3 bg-muted/40 px-3 py-3" variant="muted">
      <AbstractAvatar
        agentId={agentId}
        name={profile.name}
        seed={profile.avatarSeed}
        size={48}
      />
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle>Profile photo</ItemTitle>
        <ItemDescription>
          {custom
            ? "Custom upload for this browser."
            : "Connect default — upload your own anytime."}
        </ItemDescription>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </ItemContent>
      <div className="flex shrink-0 gap-1">
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
        <Button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
          variant="secondary"
        >
          Upload
        </Button>
        {custom ? (
          <Button
            disabled={busy}
            onClick={() => {
              clearBotAvatarOverride(agentId);
              bump((n) => n + 1);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Reset
          </Button>
        ) : null}
      </div>
    </Item>
  );
}

function AgentAccountSettings({
  agentId: _agentId,
  currentEmail,
  canManage,
  onSave,
}: {
  agentId: string;
  currentEmail?: string | null;
  canManage: boolean;
  onSave: (email: string | null) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentEmail ?? "");
  const [saving, setSaving] = useState(false);
  const codexAccounts = useQuery(codexAccountsQueryOptions());
  const availableEmails = codexAccounts.data?.availableEmails ?? [];

  const handleSave = async (emailToSave: string | null) => {
    setSaving(true);
    try {
      await onSave(emailToSave?.trim() ? emailToSave.trim() : null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Item size="sm" variant="muted">
        <ItemContent>
          <div className="flex items-center gap-1.5">
            <IconMail className="size-4 text-emerald-500" />
            <ItemTitle>CLI-Konto & Config-Verzeichnis</ItemTitle>
          </div>
          <ItemDescription>
            Eigenes CLI-Konto (CODEX_HOME / CLAUDE_CONFIG_DIR). Eingeloggte E-Mail wird am Agenten gespeichert.
          </ItemDescription>
        </ItemContent>
      </Item>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] text-muted-foreground block">Aktives Konto:</span>
            <span className="text-xs font-semibold text-foreground truncate block">
              {currentEmail?.trim() || "dailyfunde.yt@gmail.com (Google Standard)"}
            </span>
          </div>
          {canManage && !editing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(currentEmail ?? "");
                setEditing(true);
              }}
              type="button"
            >
              <IconPencil className="size-3 mr-1" />
              Ändern
            </Button>
          )}
        </div>

        {editing && (
          <div className="flex flex-col gap-2 pt-1 border-t border-border/40">
            <Input
              placeholder="z.B. skunc3021@gmail.com"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="text-xs h-8"
              type="email"
            />
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={() => void handleSave(draft)}
                disabled={saving}
                type="button"
              >
                {saving ? "Speichert…" : "Speichern"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={saving}
                type="button"
              >
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {availableEmails.length > 0 && canManage && (
          <div className="pt-2 border-t border-border/40">
            <span className="text-[10px] font-medium text-muted-foreground block mb-1.5">
              Konten aus 000_Codex Start:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableEmails.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setDraft(acc.email);
                    void handleSave(acc.email);
                  }}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium transition cursor-pointer",
                    currentEmail?.toLowerCase() === acc.email.toLowerCase()
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "border-border bg-background/80 hover:bg-muted text-muted-foreground"
                  )}
                  title={`${acc.appName}: ${acc.email}`}
                >
                  {acc.email}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One fact about the coworker, edited in place.
 *
 * Only the field somebody wants to change opens: Edit swaps this item — and this item alone — for
 * its input, validated against the same limits the server enforces, and Save writes just it back.
 */
function EditableTextItem({
  label,
  value,
  canManage,
  multiline = false,
  schema,
  onSave,
}: {
  label: string;
  value: string;
  canManage: boolean;
  /** A textarea rather than an input, for the field that is a paragraph. */
  multiline?: boolean;
  /** The field's slice of the shared form contract, so errors match the server's limits. */
  schema: ZodType<string>;
  onSave: (draft: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEditing(false);
    setError(null);
  };
  const submit = async () => {
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That value does not fit.");
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>{label}</ItemTitle>
        </ItemContent>
        <ItemActions className="min-w-0">
          <span
            className={`text-right text-sm text-muted-foreground ${
              multiline ? "line-clamp-2 whitespace-pre-wrap" : "truncate"
            }`}
          >
            {value}
          </span>
          {canManage ? (
            <Button
              aria-label={`Edit ${label.toLowerCase()}`}
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <IconPencil />
            </Button>
          ) : null}
        </ItemActions>
      </Item>
    );
  }

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        {multiline ? (
          <Textarea
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            value={draft}
          />
        ) : (
          <Input
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Not the Enter that confirms a composed character: that one would save the value
              // before the person has finished typing it.
              if (event.key === "Enter" && !isComposing(event)) {
                event.preventDefault();
                void submit();
              }
            }}
            value={draft}
          />
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex gap-2">
          <Button disabled={saving} onClick={() => void submit()} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button disabled={saving} onClick={close} size="sm" variant="outline">
            Cancel
          </Button>
        </div>
      </ItemContent>
    </Item>
  );
}
