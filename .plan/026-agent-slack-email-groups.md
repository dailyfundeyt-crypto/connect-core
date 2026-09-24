# Agent Slack + Email identities for group chats

## Goal

Slack-style groups where agents talk to each other — each bot gets its own
`@handle` and email address.

## Shipped

- Auto-provision Slack handle + `@bots.connect.local` email per agent
- Identitäten panel in agent settings (edit / auto-assign)
- Sidebar Agents list shows `@handle` under each name
- **+ → New group**: pick 2+ agents → multi-agent channel
- `@` mentions in composer match name or Slack handle
