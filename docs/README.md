# Agentic Portal Docs

This directory contains architecture, operating, and coordination docs for Jariv Agentic Portal.

## Status Snapshot (2026-02-24)

- Stack: `Next.js + Firebase App Hosting + Firestore + Gemini (@google/genai)`.
- Auth: Google sign-in with Firebase session cookies.
- Integrations: Gmail + Calendar OAuth, Slack user-token settings.
- Agent: multi-step Gemini tool-calling loop with streaming text/thought/tool-call events and approval gates.
- Tools live: `gmail_draft_create`, `gmail_search`, `gmail_thread_read`, `gmail_reply`, `gmail_send`, `calendar_event_create`, `calendar_event_update`, `calendar_search`, `save_memory`, `search_memory`, `slack_channels`, `slack_read`.
- UX live: onboarding flow, thread history browser, activity panel, memory panel, workspace pulse, cached morning briefing warmup.
- Dashboard live: three-column layout (`LeftSidebar`, center action feed with inline approvals, `RightRail` with calendar/inbox/drafts pin/send actions and tool-activity highlights).
- Refactor in progress: dashboard orchestration extraction into hooks (`use-chat-runner`, `use-workspace-data`, `use-agent-trust`, `use-thread-history`) to reduce merge/conflict risk.

## Read This First (New Teammates)

1. `docs/AGENTS.md`
2. `docs/new-contributor-quickstart.md`
3. `docs/execution-playbook.md`
4. `docs/decision-log.md`

## Doc Map

- `docs/new-contributor-quickstart.md` (current)
  - Environment setup, local run, smoke tests, key file map.
- `docs/execution-playbook.md` (current)
  - Day-to-day implementation/deploy/release runbook.
- `docs/agentic-portal-master-plan.md` (current)
  - Product/architecture north star and phased direction.
- `docs/gemini-agent-runtime-spec.md` (current)
  - Source-of-truth runtime contract for `/api/agent/run*`.
- `docs/memory-and-user-profile.md` (current)
  - Actual memory model and prompt-injection behavior.
- `docs/trust-and-autonomy-ux.md` (current)
  - Trust philosophy and UX progression.
- `docs/gmail-drafts-tool.md` (current)
  - Draft-first email behavior and tool semantics.
- `docs/decision-log.md` (current)
  - Major technical decisions and revisit triggers.
- `docs/gemini-integration-roadmap.md` (historical + refreshed status)
- `docs/gemini-execution-checklist.md` (historical + refreshed checklist)
- `docs/bootstrap-status-2026-02-16.md` (historical snapshot)

## Working Rule

If this folder and code disagree, trust code first, then `docs/AGENTS.md`, then update docs in the same change.

---
Signed by: Codex (GPT-5)
Date: 2026-02-24
