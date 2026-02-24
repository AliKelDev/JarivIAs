# Decision Log

This file records architecture decisions to avoid re-litigating the same choices.

## 2026-02-16: Frontend Framework and Hosting Pattern

### Decision

Use `Next.js` on `Firebase App Hosting` for the portal web app.

### Why

- App Hosting has first-class support for Next.js.
- Product requires secure server-side OAuth and tool execution.
- One deployable unit keeps V1 operationally simple.

### Revisit Conditions

Revisit if:
1. Product intentionally moves to split architecture (`SPA + dedicated backend`).
2. Hosting constraints materially block roadmap execution.

## 2026-02-17: Approval Policy Baseline for Side Effects

### Decision

Ship V1 with explicit approval UX for side-effect actions and recipient allowlist for repeat Gmail sends.

### Why

- Prevent accidental high-impact actions.
- Keep recurring workflows practical.

### Revisit Conditions

Revisit when richer policy primitives and audit UX are complete.

## 2026-02-17: Thread-First Agent UX with Streaming

### Decision

Make threaded chat + token streaming the default interaction model.

### Why

- Multi-turn clarification is natural for agent workflows.
- Streaming improves perceived responsiveness.

### Revisit Conditions

Revisit if telemetry shows task-first UI clearly outperforms chat.

## 2026-02-19: Trust Levels as First-Class Policy Input

### Decision

Use per-user trust levels (`supervised`, `delegated`, `autonomous`) as the primary policy mode for side-effect tools.

### Why

- Matches product trust journey.
- Keeps approval behavior predictable and configurable.

### Revisit Conditions

Revisit if policy needs become domain-specific enough to require fine-grained rule authoring.

## 2026-02-19: Bounded Multi-Step Tool Loop

### Decision

Run agent execution as a bounded multi-step planning loop instead of single-shot tool execution.

### Why

- Enables multi-action completion within one run.
- Keeps memory/context stable across tool steps.

### Parameters

- `AGENT_MAX_LOOP_STEPS` default `8`, clamp `1..15`.

### Revisit Conditions

Revisit if queue-based execution is introduced for long-running action chains.

## 2026-02-20: Agent-Driven Memory Writes

### Decision

Use explicit `save_memory` tool calls from Alik instead of post-run extraction jobs.

### Why

- Memory writes happen with full conversational context.
- Lower background complexity and better memory quality.

### Revisit Conditions

Revisit if autonomous memory quality needs post-run dedupe or ranking passes.

## 2026-02-21: On-Login Briefing Preparation

### Decision

Generate/cache daily briefing on dashboard load via `POST /api/agent/briefing/prepare` before introducing scheduler infrastructure.

### Why

- Improves first-click responsiveness.
- Avoids infra overhead while product is still iterating quickly.

### Revisit Conditions

Revisit when scale/latency requires scheduled precompute.

## 2026-02-23: Slack Token-First Integration

### Decision

Ship Slack read support using user-provided token in settings before Slack OAuth rollout.

### Why

- Faster implementation.
- Avoids early OAuth app verification overhead.

### Revisit Conditions

Revisit once external user adoption requires managed OAuth onboarding.

## 2026-02-24: Three-Column Dashboard as Default Operating Layout

### Decision

Keep the dashboard in a fixed-height three-column shell:
- left: identity, service chips, thread list
- center: action feed + inline approval cards + composer
- right: compact calendar/inbox/drafts rail with pin/send interactions

### Why

- Makes agent actions, approvals, and workspace context visible at the same time.
- Reduces modal/context switching for high-frequency review-and-approve workflows.

### Revisit Conditions

Revisit if:
1. Telemetry shows poor task completion due to layout density.
2. Mobile usage patterns require a different default information hierarchy.

## 2026-02-24: Explicit File-Boundary and Path-Scoped Staging Protocol

### Decision

In multi-agent mode, require:
- pre-claim exact file boundaries,
- hard-stop on non-owned modified files before staging,
- path-scoped staging (`git add <explicit paths only>`).

### Why

- Prevents silent overlap and accidental staging of unrelated concurrent work.
- Keeps commits auditably single-scope on a shared branch.

### Revisit Conditions

Revisit if/when workflow moves from shared-branch development to short-lived per-agent branches.

---
Signed by: Codex (GPT-5)
Date: 2026-02-24
