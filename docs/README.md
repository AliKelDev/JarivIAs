# Agentic Portal Docs

This folder captures the long-term plan for building and operating the AI assistant portal.

## Status Snapshot (2026-02-17)

- Core web app is live on Firebase App Hosting with Google login + protected dashboard.
- Google OAuth connector is wired for Gmail/Calendar actions.
- Gmail send + Calendar create actions are functional from the dashboard.
- Gmail approval gate (No / Yes once / Always allow recipient) is implemented in UI + API.
- Repo was pushed to `origin/main` at commit `176a9dc`.

## Files

- `docs/agentic-portal-master-plan.md`
  - Product scope, architecture, security model, data model, roadmap, risks.
- `docs/execution-playbook.md`
  - Step-by-step implementation checklist, command checklist, release checklist, and operating cadence.
- `docs/gemini-integration-roadmap.md`
  - Gemini-specific architecture decisions and phased integration plan for this codebase.
- `docs/gemini-agent-runtime-spec.md`
  - Detailed runtime contract for function calling, tool dispatch, approvals, and run persistence.
- `docs/gemini-execution-checklist.md`
  - Concrete implementation checklist and CLI runbook for enabling Gemini in production safely.
- `docs/bootstrap-status-2026-02-16.md`
  - Concrete bootstrap status for the current cloud project, deployed backend, and next implementation steps.
- `docs/decision-log.md`
  - Architecture decisions and rationale (including framework/hosting choices).

## How to Use These Docs

1. Start with `docs/agentic-portal-master-plan.md` to align on architecture and guardrails.
2. Execute work from `docs/execution-playbook.md` phase by phase.
3. Update checkboxes and notes after each completed task.
4. Revisit risks and scope before adding new connectors or automation.
