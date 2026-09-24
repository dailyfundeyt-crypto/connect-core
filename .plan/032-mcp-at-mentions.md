# Composer `@` → MCP Sammlung

Typing `@` + a query searches the local MCP catalog (Gmail, Slack, Linear,
Notion, …) alongside channel agents. MCP chips use an `mcp:` value prefix so
they never steal `agentId`. Selected server ids ride along on the draft and
are passed to the bot as a turn hint.
