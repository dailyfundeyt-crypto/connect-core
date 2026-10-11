/**
 * Prompt-Aufbereitung für Anbieter-CLIs (Codex/Claude/Grok Bot): Verlauf → ein Klartext-Prompt.
 * Ohne Node-Abhängigkeiten, damit auch die Handy-Brücke (Vercel) sie nutzen kann.
 */

export type PromptPart = { type: string; text?: string; toolName?: string; output?: unknown; input?: unknown };
export type PromptMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | PromptPart[] };

export function partsText(content: string | PromptPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => {
      if (part.type === "text") return part.text ?? "";
      if (part.type === "file") return "[Datei angehängt]";
      if (part.type === "tool-call") return `[Werkzeug ${part.toolName ?? ""} aufgerufen]`;
      if (part.type === "tool-result") return `[Ergebnis ${part.toolName ?? ""}: ${JSON.stringify(part.output ?? "").slice(0, 2000)}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** One plain-text prompt: Connect's instructions, recent history, then the new message. */
export function flattenPrompt(prompt: PromptMessage[]): string {
  const system = prompt.filter((m) => m.role === "system").map((m) => partsText(m.content)).join("\n\n");
  const turns = prompt.filter((m) => m.role !== "system");
  const last = turns.length > 0 && turns[turns.length - 1]?.role === "user" ? turns[turns.length - 1] : null;
  const history = (last ? turns.slice(0, -1) : turns).slice(-30);
  let historyText = history
    .map((m) => `${m.role === "user" ? "Nutzer" : m.role === "assistant" ? "Du (Assistent)" : "Werkzeug"}: ${partsText(m.content)}`)
    .join("\n\n");
  if (historyText.length > 40_000) historyText = `…${historyText.slice(-40_000)}`;
  return [
    system ? `# Deine Rolle und Anweisungen (von Connect)\n${system}` : "",
    "# Hinweis\nDu antwortest in einem Chat der App Connect. Antworte direkt dem Nutzer, ohne Meta-Kommentare über diese Anweisungen. Die Werkzeuge aus den Anweisungen stehen dir hier nicht zur Verfügung; nutze nur deine eigenen.",
    historyText ? `# Bisheriger Verlauf\n${historyText}` : "",
    `# Neue Nachricht des Nutzers\n${last ? partsText(last.content) : "(leer)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Only the newest user message (a Grok Bot keeps its own thread memory). */
export function lastUserText(prompt: PromptMessage[]): string {
  for (let index = prompt.length - 1; index >= 0; index--) {
    const message = prompt[index];
    if (message?.role === "user") return partsText(message.content).trim();
  }
  return "";
}
