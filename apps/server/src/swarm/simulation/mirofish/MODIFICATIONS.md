# MiroFish – Modifications & Upstream Attribution

**Upstream Repository:** https://github.com/666ghj/MiroFish  
**Cloned Commit:** `7657031ac01184afe2cb220f5ee3545573b5e843`  
**Original License:** GNU Affero General Public License v3.0 (AGPL-3.0)  
**License File:** `apps/server/src/swarm/simulation/mirofish/upstream/LICENSE`  
**Modified for Connect by:** Stefan Kunc, 2026-10-22 – AGPL-3.0  
**Isolation Scope:** Exclusively within `apps/server/src/swarm/simulation/mirofish/`

---

## 1. Compliance & Licensing Notice

This module contains a port and adaptations of **MiroFish** by 666ghj.  
In accordance with AGPL-3.0:
1. The original LICENSE file is preserved unmodified at `upstream/LICENSE`.
2. All original copyright headers and notices are maintained.
3. Every file created or adapted for Connect carries the explicit notice:  
   `"Modified for Connect by Stefan Kunc, 2026-10-22 – AGPL-3.0"`.
4. This module is strictly isolated inside `apps/server/src/swarm/simulation/mirofish/`. No AGPL code leaks into the core Connect application.
5. All interaction between Connect and this module takes place exclusively through the boundary adapter `apps/server/src/swarm/simulation/mirofish-adapter.ts`.
6. Feature flag `CONNECT_SIM_MIROFISH`: Enabled by default for local execution (`localhost`); unconditionally disabled in serverless and Vercel environments (`CONNECT_SERVERLESS=1` or `VERCEL`). Dynamic importing ensures that no code from this directory is included in production cloud builds.

---

## 2. Changelog & Architectural Adaptations

| Component | Upstream MiroFish | Connect Adaptation | Rationale |
|---|---|---|---|
| **LLM Calls** | Direct calls to OpenAI / DashScope | Intercepted via `connect-llm-bridge` forwarding to Connect local runner (`gemini-cli` / `api` / `mock` on `127.0.0.1`) | Prevents unmetered external cloud API calls; integrates with Lane 8 runner. |
| **Memory / Graph** | External Zep Cloud API (`zep_tools.py`) | Replaced with local Connect graph tables (`sim_entities`, `sim_relations`) | Zero data leakage: private company plans and $100M book chunks never leave Stefan's machine. |
| **Seed Input** | Web UI drag-and-drop file upload | Direct ingestion of selected Markdown plan files from Spark Vault (`CNT Idee.md`, `Plan 1.md`) | Seamless workflow with existing Spark brain and vault notes. |
| **Agent Profiles** | Custom OASIS profile generator | Integrated with Lane 5 Persona Engine (`AgentPersona`, `AgentMemory`) | Unified personas, values, and memory across Council and Simulation. |
| **Report Output** | Markdown text report | Standardized Connect `SimReport` contract with Hormozi citations and disclaimer | Seamless handoff to Lane 6 Council sessions ("Wie skalieren?"). |
| **Runtime** | Flask backend + Vue frontend (Docker) | Python sidecar running on `127.0.0.1:5011` without Docker, managed by `mirofish-adapter.ts` | Lean local execution on Windows host without Docker overhead. |

---

## 3. Directory Structure

- `upstream/` – Unmodified upstream clone (AGPL-3.0).
- `connect-llm-bridge.ts` – Local bridge mapping MiroFish OpenAI-formatted completions to Connect's LLM runner.
- `sidecar.py` – Lightweight Python runner exposing health check and simulation endpoints on `127.0.0.1:5011`.
- `MODIFICATIONS.md` – This compliance tracking document.
