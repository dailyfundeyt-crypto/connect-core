# External bot CLIs + Manus mail routing

## Goal

Drive Manus, ChatGPT, Claude, Grok, Cursor, and Lovable from inside Connect chat via embedded terminal panes. For Manus, map mailbox entries (by matching agent name / email) to agents and auto-forward those messages into the Manus CLI / chat queue.

## What shipped

- `lib/agents/agent-cli.ts` — per-agent CLI target + localStorage queue (desktop bridge pending).
- `AgentCliPanel` — terminal UI for all six targets; used in agent settings and as an in-chat drawer (`Bot-CLI`).
- `lib/agents/manus-mail.ts` — aliases, ingest, name/email matching, auto-forward into Manus CLI.
- `ManusMailPanel` — assign mailbox name/email to an agent, simulate ingest, forward to chat.
- Saving an agent identity email also writes the Manus alias (same name → same agent).

## Local notes

Commands stay queued until a local desktop bridge is online. Mail ingest is simulated in-browser; wire a real mailbox sync later.
