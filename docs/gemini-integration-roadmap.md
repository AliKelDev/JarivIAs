# Gemini Integration Roadmap

Last updated: 2026-02-24

This roadmap now tracks what is shipped versus what remains for runtime maturity.

## 1. Objective

Run a production-safe Gemini planning runtime that can execute tools with policy gates, approvals, and durable traceability.

## 2. Current Status Summary

Shipped:
- Gemini integration via `@google/genai`.
- Vertex AI runtime path (default) with optional API-key fallback.
- Tool-calling orchestrator with multi-step loop.
- Streaming output via `/api/agent/run/stream` (`delta`, `thought_delta`, `tool_call`).
- Approval pause/resume flow.
- Thread, action, and run persistence.
- Memory-aware system instruction and memory tools.
- Extended Gmail toolset for thread workflows (`gmail_search`, `gmail_thread_read`, `gmail_reply`, `gmail_draft_create`, `gmail_send`).
- Dashboard hook extraction for orchestration/data loading (`use-chat-runner`, `use-workspace-data`, `use-agent-trust`, `use-thread-history`).

In progress / next:
- Stronger side-effect idempotency and retries.
- Deeper observability (per-stage latency + failure metrics).
- Continue splitting oversized dashboard client state into focused modules.

## 3. Phase Tracking

## Phase A: SDK + Infra Wiring

- Status: `Done`
- Result: Gemini calls are server-side and deployed.

## Phase B: Tool Calling Contracts

- Status: `Done`
- Result: strict tool schemas + deterministic dispatch.

## Phase C: Approval-Aware Execution

- Status: `Done`
- Result: pending approvals block execution until resolve route call.

## Phase D: UX + Streaming Integration

- Status: `Done`
- Result: chat streaming, thread persistence, history load.

## Phase E: Context and Memory Depth

- Status: `Done`
- Result: profile/memory injection + `save_memory` and `search_memory`.

## Phase F: Reliability Hardening

- Status: `In progress`
- Remaining:
  - idempotency safeguards for side effects
  - retry/backoff policy by error class
  - richer telemetry and run diagnostics
  - remaining dashboard state extraction to reduce merge conflicts

## 4. Runtime Defaults

- Model default: `gemini-2.5-flash`
- Planning temperature: `1`
- Function calling mode: `AUTO`
- Thinking traces: enabled (`includeThoughts=true`)
- Loop limit: `AGENT_MAX_LOOP_STEPS` default `8` (clamped `1..15`)

## 5. Risks and Mitigations

- Tool arg drift from model output
  - Mitigation: strict per-tool validation.
- Unintended side effects
  - Mitigation: trust-level policy + approval gate + global kill switch.
- Latency perception in long runs
  - Mitigation: streaming + cached/prepared briefing + prompt/context hygiene.

## 6. Next Decision Gates

- When to add queue-based execution for long or flaky tool calls.
- When to migrate Slack token auth to OAuth.
- When to add cost/latency budget enforcement per user/session.

---
Signed by: Codex (GPT-5)
Date: 2026-02-24
