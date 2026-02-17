# Gemini Integration Roadmap

Last updated: 2026-02-17

## 1. Objective

Run a production-safe Gemini planning + tool-calling runtime that:

- Plans actions from user prompts.
- Calls registered tools (Gmail, Calendar, later Slack, etc.).
- Enforces approval-before-side-effects policies.
- Persists run/action state in Firestore for auditability.

## 2. Current Baseline (Already Working)

- Firebase Auth login + session flow.
- Google OAuth integration for Gmail + Calendar.
- Gmail send endpoint and Calendar create endpoint.
- Gmail approval gate (reject / approve once / approve and allow recipient).
- Firestore collections for `runs`, `runs/{runId}/actions`, and `audit`.
- Gemini runtime routes are active:
  - `/api/agent/run`
  - `/api/agent/run/stream`
  - `/api/agent/thread`
  - `/api/agent/approvals/pending`
  - `/api/agent/approvals/resolve`
- Dashboard includes threaded chat with streamed assistant output and inline approval cards.

## 3. Gemini Stack Decision

Use:

- SDK: `@google/genai` (official Google Gen AI SDK).
- Runtime mode: Vertex AI (`GOOGLE_GENAI_USE_VERTEXAI=true`).
- Auth: Application Default Credentials from App Hosting service account.
- Model default: `gemini-2.5-flash` for V1 latency/cost balance.

Why this path:

- Keeps secrets out of client/browser.
- Uses Google Cloud IAM instead of manual API-key handling in server code.
- Fits existing Firebase App Hosting deployment model.

## 4. Architecture Additions

```text
[Next.js API route /api/agent/run]
        |
        +--> [Gemini Orchestrator]
               |
               +--> [Tool Registry]
               |      +--> gmail_send
               |      +--> calendar_event_create
               |
               +--> [Policy/Approval Gate]
               |      +--> immediate execute
               |      +--> awaiting_confirmation
               |
               +--> [Firestore run/action persistence]
```

New code areas to add:

- `web/src/lib/agent/gemini-client.ts`
- `web/src/lib/agent/tool-registry.ts`
- `web/src/lib/agent/policy.ts`
- `web/src/lib/agent/orchestrator.ts`
- `web/src/lib/agent/types.ts`

## 5. Phase Plan

## Phase A: Infrastructure + SDK Wiring

- Status: `Completed`
- Add `@google/genai`.
- Add runtime env vars in `web/apphosting.yaml`.
- Verify App Hosting service account has Vertex AI access.
- Build a minimal Gemini smoke-call module.

Exit criteria:

- A test server route can call Gemini and return text with model + token metadata.

## Phase B: Tool Calling Contracts

- Status: `Completed`
- Define tool registry interface with JSON schemas.
- Register existing Gmail + Calendar functions as tools.
- Add strict input validation before any tool execution.

Exit criteria:

- Gemini can request a tool call and server dispatches it deterministically.

## Phase C: Approval-Aware Execution

- Status: `Completed (V1 baseline)`
- Unify existing Gmail approval behavior into central policy engine.
- Add `awaiting_confirmation` run state transitions.
- Persist pending action payloads in Firestore.

Exit criteria:

- Side-effect actions pause/resume correctly with full audit trail.

## Phase D: Dashboard Integration

- Status: `Completed (initial)`
- Keep the dashboard on real Gemini-backed runs with consistent UX.
- Show pending approvals and recent action results in one stream.
- Keep manual action cards available for deterministic debugging.
- Stream assistant text deltas in chat while the run is executing.

Exit criteria:

- Prompt -> plan -> tool call -> approval (if required) -> execution -> visible run result.

## Phase E: Hardening

- Status: `In progress`
- Add retries/idempotency for side-effect actions.
- Add structured error mapping and redaction-safe logs.
- Add integration tests and smoke tests for deploy validation.

Exit criteria:

- Duplicate side effects are prevented and failure modes are observable.

## 6. Policy Defaults for V1

- `gmail_send`: approval required by default.
- `calendar_event_create`: approval required by default.
- Allowlist behavior: per-recipient bypass only when explicitly granted.
- “Kill switch” env flag should disable all side-effect tools immediately.

## 7. Risks and Mitigations

- Risk: model output drift causes malformed tool args.
  - Mitigation: strict schema validation and reject-on-invalid.
- Risk: accidental autonomous side effects.
  - Mitigation: centralized approval checks for all side-effect tools.
- Risk: rollout regressions.
  - Mitigation: keep fallback manual endpoints and route-level feature flags.

## 8. References

- Gemini function calling docs: https://ai.google.dev/gemini-api/docs/function-calling
- Google Gen AI JS SDK (`@google/genai`) examples: https://github.com/googleapis/js-genai
- Firebase App Hosting service account guidance: https://firebase.google.com/docs/app-hosting/configure#configure_an_app_hosting_backend_s_service_account
- Gemini skills reference repo (inspiration): https://github.com/google-gemini/gemini-skills
