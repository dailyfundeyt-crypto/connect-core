import React, { useEffect, useState } from "react";
import {
  IconMail,
  IconCheck,
  IconX,
  IconPlus,
  IconAlertCircle,
  IconSend,
  IconRefresh,
  IconLock,
  IconRobot,
  IconClock,
} from "@tabler/icons-react";
import type { EmailAgent } from "@/contracts/api";

type DraftMessage = {
  id: string;
  emailAgentId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent" | "received" | "rejected";
  threadId?: string | null;
  taskId?: string | null;
  createdAt: string;
};

export function EmailAgentsSettings() {
  const [agents, setAgents] = useState<EmailAgent[]>([]);
  const [drafts, setDrafts] = useState<DraftMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Formular-State für neuen Bot
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [autoSendAllowed, setAutoSendAllowed] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [categories, setCategories] = useState("automation, research");
  const [submitting, setSubmitting] = useState(false);

  // Test-Draft Formular
  const [testAgentId, setTestAgentId] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [testBody, setTestBody] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resAgents, resDrafts] = await Promise.all([
        fetch("/api/email-agents").then((r) => r.json()),
        fetch("/api/email-agents/drafts").then((r) => r.json()),
      ]);

      if (resAgents.ok && Array.isArray(resAgents.emailAgents)) {
        setAgents(resAgents.emailAgents);
        if (resAgents.emailAgents.length > 0 && !testAgentId) {
          setTestAgentId(resAgents.emailAgents[0].id);
        }
      }
      if (resDrafts.ok && Array.isArray(resDrafts.drafts)) {
        setDrafts(resDrafts.drafts);
      }
    } catch (err: any) {
      setError(err?.message || "Fehler beim Laden der E-Mail-Bots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError("Beschreibung ist Pflicht: Bitte beschreiben Sie genau, was der E-Mail-Agent tut.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const categoryList = categories.split(",").map((c) => c.trim()).filter(Boolean);
      const res = await fetch("/api/email-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          description,
          autoSendAllowed,
          dailyLimit: Number(dailyLimit) || 50,
          categories: categoryList,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Fehler beim Anlegen");

      setActionSuccess(`E-Mail-Bot "${name}" erfolgreich angelegt.`);
      setShowAddModal(false);
      setName("");
      setEmail("");
      setDescription("");
      setAutoSendAllowed(false);
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Anlegen");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/email-agents/drafts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Fehler bei Freigabe");
      setActionSuccess("Entwurf freigegeben und versendet.");
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler bei Freigabe");
    }
  };

  const handleRejectDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/email-agents/drafts/${id}/reject`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Fehler beim Ablehnen");
      setActionSuccess("Entwurf abgelehnt.");
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Ablehnen");
    }
  };

  const handleDeleteBot = async (id: string) => {
    if (!confirm("Diesen E-Mail-Bot wirklich löschen?")) return;
    try {
      await fetch(`/api/email-agents/${id}`, { method: "DELETE" });
      setActionSuccess("E-Mail-Bot gelöscht.");
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Löschen");
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testAgentId || !testSubject || !testBody) return;
    setSendingTest(true);
    setError(null);
    try {
      const res = await fetch("/api/email-agents/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAgentId: testAgentId,
          subject: testSubject,
          body: testBody,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Fehler beim Erstellen der Nachricht");
      setActionSuccess(data.message);
      setTestSubject("");
      setTestBody("");
      void loadData();
    } catch (err: any) {
      setError(err?.message || "Fehler beim Senden");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header & Status */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <IconMail className="w-6 h-6 text-primary" />
            Externe E-Mail-Bots (Prompt 10.3)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect-Agenten können über Stefans Nutzer-E-Mail externe Bots kontaktieren.
            Standardmäßig wird ein Entwurf erzeugt, der vor dem Versand von Stefan freigegeben werden muss.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted"
          >
            <IconRefresh className="w-4 h-4" />
            Aktualisieren
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <IconPlus className="w-4 h-4" />
            Neuer E-Mail-Bot
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-sm bg-destructive/15 text-destructive border border-destructive/30 rounded-md flex items-center gap-2">
          <IconAlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 text-sm bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-md flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconCheck className="w-4 h-4" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-xs opacity-70 hover:opacity-100">
            Ausblenden
          </button>
        </div>
      )}

      {/* 1. Ausstehende Entwürfe (Stefan Freigabe) */}
      <div className="border rounded-lg p-5 bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <IconClock className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-base">Freigabe-Inbox für Stefan</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-medium">
              {drafts.length} Entwürfe ausstehend
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Standard: Freigabe erforderlich vor Versand</span>
        </div>

        {drafts.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-md">
            Keine ausstehenden Entwürfe. Alle E-Mails sind freigegeben oder versendet.
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="p-4 border rounded-md bg-background flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{draft.subject}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      An: {draft.recipientEmail}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-2">
                    {draft.body}
                  </p>
                  <div className="text-[11px] text-muted-foreground">
                    Erstellt: {new Date(draft.createdAt).toLocaleString("de-DE")}
                    {draft.threadId && ` · Thread: ${draft.threadId}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApproveDraft(draft.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                  >
                    <IconCheck className="w-3.5 h-3.5" />
                    Freigeben & Senden
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectDraft(draft.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-destructive hover:bg-destructive/10 text-xs font-medium"
                  >
                    <IconX className="w-3.5 h-3.5" />
                    Ablehnen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Registrierte E-Mail-Bots */}
      <div className="border rounded-lg p-5 bg-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <IconRobot className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-base">Registrierte externe E-Mail-Bots</h3>
            <span className="text-xs text-muted-foreground">({agents.length})</span>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="text-sm text-muted-foreground p-6 text-center border border-dashed rounded-md">
            Noch keine externen E-Mail-Bots angelegt. Klicken Sie oben auf "Neuer E-Mail-Bot", um einen hinzuzufügen.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="border rounded-md p-4 bg-background flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-1.5">
                      {agent.name}
                      {agent.autoSendAllowed ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
                          Auto-Send aktiv
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-0.5">
                          <IconLock className="w-3 h-3" /> Freigabe nötig
                        </span>
                      )}
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleDeleteBot(agent.id)}
                      className="text-muted-foreground hover:text-destructive text-xs p-1"
                      title="Bot entfernen"
                    >
                      <IconX className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs text-primary font-mono mt-0.5">{agent.email}</div>
                  <p className="text-xs text-muted-foreground mt-2 border-l-2 pl-2 border-primary/30">
                    <span className="font-medium text-foreground">Beschreibung (Pflicht):</span> {agent.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>Tageslimit: {agent.sentToday || 0} / {agent.dailyLimit} E-Mails</span>
                  <span className={`capitalize ${agent.status === "active" ? "text-emerald-500" : "text-amber-500"}`}>
                    Status: {agent.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Schnelltest: Entwurf an E-Mail-Bot erzeugen */}
      {agents.length > 0 && (
        <div className="border rounded-lg p-5 bg-card">
          <h3 className="font-semibold text-base mb-2 flex items-center gap-2">
            <IconSend className="w-4 h-4 text-primary" />
            Nachricht an E-Mail-Bot testen (Erzeugt Entwurf oder Auto-Send)
          </h3>
          <form onSubmit={handleSendTestMessage} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Empfänger-Bot</label>
                <select
                  value={testAgentId}
                  onChange={(e) => setTestAgentId(e.target.value)}
                  className="w-full text-xs rounded border bg-background px-3 py-2"
                >
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email}) {a.autoSendAllowed ? "[Auto-Send]" : "[Freigabe erforderlich]"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Betreff</label>
                <input
                  type="text"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  placeholder="z.B. Recherche-Auftrag Analyse Helium 2026"
                  required
                  className="w-full text-xs rounded border bg-background px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Nachricht / Anweisung an den Bot</label>
              <textarea
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                placeholder="Geben Sie hier die Anweisung für den externen Bot ein..."
                rows={3}
                required
                className="w-full text-xs rounded border bg-background px-3 py-2 font-mono"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sendingTest}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-medium rounded hover:opacity-90 disabled:opacity-50"
              >
                <IconSend className="w-3.5 h-3.5" />
                {sendingTest ? "Verarbeite..." : "Nachricht senden / Entwurf anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Neuer E-Mail-Bot */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-background border rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base flex items-center gap-2">
                <IconRobot className="w-5 h-5 text-primary" />
                Neuen externen E-Mail-Bot anlegen
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBot} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium mb-1">Name des Bots *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Perplexity Research Bot"
                  required
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">E-Mail-Adresse des Bots *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="bot@partner-agent.ai"
                  required
                  className="w-full border rounded px-3 py-2 bg-background font-mono"
                />
              </div>

              <div>
                <label className="block font-medium mb-1 text-destructive">
                  Beschreibung (Pflichtfeld: Was tut dieser Bot?) *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Genaue Beschreibung: Dieser Bot analysiert Marktdaten und schickt strukturierte Zusammenfassungen per E-Mail zurück..."
                  rows={3}
                  required
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Kategorien (Komma-getrennt)</label>
                  <input
                    type="text"
                    value={categories}
                    onChange={(e) => setCategories(e.target.value)}
                    placeholder="research, analysis, market"
                    className="w-full border rounded px-3 py-2 bg-background"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Tageslimit (E-Mails)</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(Number(e.target.value))}
                    className="w-full border rounded px-3 py-2 bg-background"
                  />
                </div>
              </div>

              <div className="border rounded p-3 bg-muted/40 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={autoSendAllowed}
                    onChange={(e) => setAutoSendAllowed(e.target.checked)}
                    className="rounded text-primary"
                  />
                  <span>Automatisches Senden erlauben (ohne Stefans Freigabe)</span>
                </label>
                <p className="text-[11px] text-muted-foreground pl-6">
                  Wenn deaktiviert (Standard), muss jeder E-Mail-Auftrag von Stefan in Connect manuell freigegeben werden.
                </p>
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
                  {submitting ? "Speichert..." : "Bot anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmailAgentsSettings;
