# Composer model picker + per-agent model pools

## Goal

Composer shows a visible model control (label + chevron). Allowed models are
fixed when the agent is created:

- **Manus** → Manus models only
- **ChatGPT** → OpenAI models only
- **Cursor** → Cursor catalog (+ common routes)
- **Connect** → full catalog
- Claude / Grok / Lovable → their own pools

## Notes

Family is stored in `localStorage` (`connect.agent-model-families`) and kept in
sync with the agent CLI target tabs.
