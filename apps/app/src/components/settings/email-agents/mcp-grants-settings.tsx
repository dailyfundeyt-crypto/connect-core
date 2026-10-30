import React, { useEffect, useState } from "react";
import {
  IconKey,
  IconShieldCheck,
  IconPlus,
  IconRefresh,
  IconCopy,
  IconCheck,
  IconAlertTriangle,
  IconHistory,
  IconLock,
} from "@tabler/icons-react";
import type { McpGrant } from "@/contracts/api";

type AuditEntry = {
  id: string;
  grantId: string | null;
  agentName: string | null;
  toolName: string;
  paramsSummary: string | null;
  status: "success" | "denied" | "error";
  statusDetail: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export function McpGrantsSettings() {
  const [grants, setGrants] = useState<McpGrant[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<{ agentName: string; plaintext: string } | null>(null);

  // Formular-State
  const [showAddModal, setShowAddModal] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["swarm:hyper", "app:open_qr"]);
  const [submitting, setSubmitting] = useState(false);

  const AVAILABLE_SCOPES = [
    { id: "swarm:hyper", label: "swarm:hyper (Hyper Swarm Steuerung)" },
    { id: "swarm:flux", label: "swarm:flux (Flux Content Swarm)" },
    { id: "swarm:analysis", label: "swarm:analysis (Analysis Swarm)" },
    { id: "swarm:general", label: "swarm:general (Allgemeiner 20-Bot Swarm)" },
    { id: "agents:health", label: "agents:health (Connect Wartung / Diagnose)" },
    { id: "app:open_qr", label: "app:open_qr (Mobiles QR-System öffnen)" },
    { id: "brain:write", label: "brain:write (Brain & Knowledge schreiben)" },
    { id: "skills:*", label: "skills:* (CNT Code & Skills Execution)" },
    { id: "agents:subagents", label: "agents:subagents (Perplexity & Manus Subagenten)" },
    { id: "email_agents:*", label: "email_agents:* (Externe E-Mail-Bots ansprechen)" },
  ];

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resGrants, resAudit] = await Promise.all([
        fetch("/api/mcp-grants").then((r) => r.json()),
        fetch("/api/mcp-grants/audit?limit=25").then((r) => r.json()),
      ]);

      if (resGrants.ok && Array.isArray(resGrants.grants)) {
        setGrants(resGrants.grants);
      }
      if (resAudit.ok && Array.isArray(resAudit.auditLogs)) {
        setAuditLogs(resAudit.auditLogs);
      }
    } catch (err: any) {
      setError(err?.message || "Fehler beim Laden der MCP-Grants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSeedDefaults = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-grants/seed-defaults", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Initialisieren der Standard-Grants");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: agentName.trim(),
          scopes: selectedScopes,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Fehler beim Erstellen");

      setNewlyCreatedToken({
        agentName: data.grant.agentName,
        plaintext: data.plaintextToken,
      });
      setShowAddModal(false);
      setAgentName("");
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Erstellen");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Diesen Grant wirklich widerrufen?")) return;
    try {
      await fetch(`/api/mcp-grants/${id}`, { method: "DELETE" });
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Deaktivieren");
    }
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId],
    );
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <IconKey className="w-6 h-6 text-primary" />
            Connect-MCP Berechtigungen & Grok-Bot Grants (Prompt 10.2)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Grobe und feingranulare Token-Berechtigungen für externe Grok-Bot-Agenten (Hyper, Flux, Connect Wartung, Analysis, CNT Code).
            Jeder Aufruf wird kryptografisch validiert und im Audit-Log festgehalten.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSeedDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted"
            title="Legt die 5 Standard Grok-Bot Grants an falls noch nicht vorhanden"
          >
            <IconShieldCheck className="w-4 h-4 text-emerald-500" />
            5 Standard-Grants einrichten
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <IconPlus className="w-4 h-4" />
            Neuer Grant
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm bg-destructive/15 text-destructive border border-destructive/30 rounded-md">
          {error}
        </div>
      )}

      {/* Token Einmal-Anzeige */}
      {newlyCreatedToken && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-1.5">
              <IconCheck className="w-4 h-4" />
              Token für "{newlyCreatedToken.agentName}" erfolgreich erzeugt
            </h4>
            <button
              onClick={() => setNewlyCreatedToken(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Schließen
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Kopieren Sie dieses Token jetzt. Es wird aus Sicherheitsgründen nur einmal im Klartext angezeigt:
          </p>
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono bg-background p-2 rounded border flex-1 select-all break-all">
              {newlyCreatedToken.plaintext}
            </code>
            <button
              type="button"
              onClick={() => handleCopy(newlyCreatedToken.plaintext)}
              className="px-3 py-2 bg-primary text-primary-foreground text-xs rounded hover:opacity-90 flex items-center gap-1"
            >
              {copiedToken === newlyCreatedToken.plaintext ? <IconCheck className="w-4 h-4" /> : <IconCopy className="w-4 h-4" />}
              {copiedToken === newlyCreatedToken.plaintext ? "Kopiert!" : "Kopieren"}
            </button>
          </div>
        </div>
      )}

      {/* 1. Aktive Grants */}
      <div className="border rounded-lg p-5 bg-card">
        <h3 className="font-semibold text-base mb-3 flex items-center gap-2">
          <IconLock className="w-5 h-5 text-primary" />
          Konfigurierte Agenten-Grants ({grants.length})
        </h3>

        {grants.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-md">
            Noch keine Grants angelegt. Klicken Sie auf "5 Standard-Grants einrichten", um Hyper, Flux, Connect Wartung, Analysis und CNT Code anzulegen.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grants.map((grant) => (
              <div key={grant.id} className="border rounded-md p-4 bg-background flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{grant.agentName}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        grant.isActive ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive"
                      }`}
                    >
                      {grant.isActive ? "Aktiv" : "Widerrufen"}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground mt-1">
                    Hash: {grant.tokenHash.slice(0, 16)}...
                  </div>

                  <div className="mt-3">
                    <span className="text-xs font-medium text-foreground block mb-1">Erlaubte Scopes:</span>
                    <div className="flex flex-wrap gap-1">
                      {grant.scopes && grant.scopes.length > 0 ? (
                        grant.scopes.map((s: string) => (
                          <span key={s} className="text-[11px] px-2 py-0.5 bg-muted rounded font-mono">
                            {s}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Keine Scopes</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Erstellt: {new Date(grant.createdAt).toLocaleDateString("de-DE")}</span>
                  {grant.isActive && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(grant.id)}
                      className="text-destructive hover:underline"
                    >
                      Widerrufen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Live MCP Audit Log (Migration 0091) */}
      <div className="border rounded-lg p-5 bg-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <IconHistory className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">MCP Audit-Log (Live-Sicherheit)</h3>
            <span className="text-xs text-muted-foreground">Letzte {auditLogs.length} Aufrufe</span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <IconRefresh className="w-3.5 h-3.5" /> Neu laden
          </button>
        </div>

        {auditLogs.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-md">
            Noch keine Audit-Einträge. Sobald Grok-Bot oder externe Agenten Tools aufrufen, erscheinen sie hier.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground border-b">
                <tr>
                  <th className="p-2">Zeit</th>
                  <th className="p-2">Agent</th>
                  <th className="p-2">Tool</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="p-2 whitespace-nowrap text-muted-foreground">
                      {new Date(log.createdAt).toLocaleTimeString("de-DE")}
                    </td>
                    <td className="p-2 font-medium">{log.agentName || "Anonym / Local"}</td>
                    <td className="p-2 font-mono text-primary">{log.toolName}</td>
                    <td className="p-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                          log.status === "success"
                            ? "bg-emerald-500/15 text-emerald-600"
                            : log.status === "denied"
                            ? "bg-amber-500/15 text-amber-600"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="p-2 max-w-xs truncate text-muted-foreground" title={log.statusDetail || log.paramsSummary || ""}>
                      {log.statusDetail || log.paramsSummary || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Neuer Grant */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-background border rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <IconKey className="w-5 h-5 text-primary" />
                Neuen MCP-Grant für Grok-Bot anlegen
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGrant} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium mb-1">Agenten-Name *</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="z.B. Hyper, Flux, Analysis oder MeinBot"
                  required
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>

              <div>
                <label className="block font-medium mb-2">Erlaubte Scopes auswählen:</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border p-3 rounded">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <label key={scope.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope.id)}
                        onChange={() => toggleScope(scope.id)}
                        className="rounded text-primary"
                      />
                      <span className="font-mono text-[11px]">{scope.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded hover:bg-muted text-xs font-medium"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 text-xs font-medium disabled:opacity-50"
                >
                  {submitting ? "Erstelle..." : "Grant & Token erzeugen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default McpGrantsSettings;
