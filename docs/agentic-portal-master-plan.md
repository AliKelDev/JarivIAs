# Agentic Portal Master Plan

Last updated: 2026-02-24

## 1. Goal

Build a web portal where authenticated users collaborate with an AI teammate (Alik) that can plan and execute real workflows with auditable guardrails.

Core outcomes:
- Actionable assistant chat with tool-calling.
- Human control over side effects through trust levels + approvals.
- Persistent context (threads, profile, memory) so the assistant improves over time.

## 2. Current Build Snapshot (2026-02-24)

Shipped:
- Landing page, login, onboarding, protected dashboard.
- Google OAuth integration for Gmail + Calendar.
- Agent runtime using Gemini via `@google/genai`.
- Multi-step tool-calling loop (default 8 steps, capped at 15).
- Approval flow for side-effect actions with resume support.
- Thread persistence + thread history browser.
- Workspace Pulse panels (upcoming calendar + recent inbox + drafts).
- Memory panel + profile editing + trust-level controls.
- Morning briefing stream + on-login prepare cache.
- Slack read integration through user-provided token settings.
- Phase 8 dashboard redesign: three-column shell, inline approval cards in feed, right-rail calendar/inbox/drafts with pin/send actions.
- Ongoing dashboard refactor to isolate orchestration state in hooks (`use-chat-runner`, `use-workspace-data`, `use-agent-trust`, `use-thread-history` shipped).

## 3. Product Boundaries

In scope (current):
- Single-user authenticated workspace.
- Gmail/Calendar/Slack read and Gmail + Calendar side-effect actions.
- Human-in-the-loop for destructive or sensitive actions.

Out of scope (for now):
- Enterprise multi-tenant admin controls.
- Fully autonomous background task automation without user-facing traceability.
- Broad connector marketplace.

## 4. Architecture

```text
[Browser: Next.js UI]
        |
        v
[Next.js server routes on Firebase App Hosting]
        |
        +--> Firebase Auth session cookies
        +--> Agent orchestrator (Gemini + tool registry + policy)
        +--> Gmail / Calendar / Slack APIs
        +--> Firestore (users, threads, runs, approvals, memory)
```

Key design choices:
- Keep frontend and server in one Next.js deployment for velocity.
- Keep tool execution server-side only.
- Keep policy checks centralized in runtime, not UI.

## 5. Runtime Model

1. Receive prompt (+ optional thread/conversation/attached context).
2. Build stable system instruction (persona + memory + attached context).
3. Run Gemini planning/tool-call loop.
4. Validate tool args and evaluate policy.
5. Pause for approval when required.
6. Execute tool, persist action/run history, continue loop.
7. Persist assistant response and return final status.

## 6. Trust and Safety Model

Trust levels:
- `supervised`: all side-effect tools require approval.
- `delegated`: allowlisted Gmail recipients auto-send; other side effects require approval.
- `autonomous`: side-effect tools allowed by policy.

Global kill switch:
- `AGENT_SIDE_EFFECTS_ENABLED=false` disables all side-effect tool execution.

## 7. Data Model (Simplified)

- `users/{uid}`: profile + account-level metadata.
- `users/{uid}/settings/*`: trust policy, Slack token config, etc.
- `users/{uid}/memory/*`: long-term memory entries.
- `users/{uid}/agentApprovals/*`: pending/resolved approvals.
- `threads/{threadId}` + `threads/{threadId}/messages/*`: chat history.
- `runs/{runId}` + `runs/{runId}/actions/*`: execution trace.

## 8. Near-Term Roadmap

1. Reliability hardening:
   - idempotency and retry semantics for side-effect tools
   - richer error telemetry per run step
   - continue reducing dashboard merge risk by splitting remaining panel/layout state from `dashboard-client.tsx`
2. UX polish:
   - tighter thread browsing and activity filtering
   - improved action cards and undo affordances
3. Connector maturity:
   - evolve Slack auth from token paste to OAuth when needed

## 9. Operational Rule

`docs/AGENTS.md` is the live coordination board. This file is the strategic baseline and should be updated when architecture or product boundaries change.

---
Signed by: Codex (GPT-5)
Date: 2026-02-24
