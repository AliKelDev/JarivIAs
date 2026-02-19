# Decision Log

This file records architecture decisions to avoid re-litigating the same choices.

## 2026-02-16: Frontend Framework and Hosting Pattern

### Decision

Use `Next.js` on `Firebase App Hosting` for the portal web app.

### Why

- Firebase App Hosting has first-class support for Next.js.
- The product needs server-side capabilities (secure OAuth handling, agent endpoints, tool execution orchestration).
- Next.js keeps frontend and server logic in one deployable app, reducing operational complexity.

### Rejected Alternative

Use React + Vite as the primary app framework.

### Reason Rejected

- Vite works well for SPA UI, but this project would still require a separate backend service for sensitive server-side operations.
- That split adds infrastructure and deployment complexity too early for V1.

### Revisit Conditions

Revisit if:

1. Product becomes frontend-only for a major surface.
2. Team intentionally chooses a split architecture (`SPA + dedicated API platform`) for scaling or org reasons.

## 2026-02-17: Approval Policy Baseline for Side Effects

### Decision

Ship V1 with explicit approval UX for Gmail send and retain a recipient allowlist option (`always allow this recipient`) to reduce repetitive confirmations for trusted contacts.

### Why

- Prevent accidental high-impact side effects from agent/tool actions.
- Keep UX practical for repeated manual operations.
- Establish a policy primitive that can later be reused by the full agent runtime.

### Revisit Conditions

Revisit if:

1. Strong role-based policy engine and audit stream are fully in place.
2. Additional tools (calendar update, messaging) are routed through centralized policy checks.

## 2026-02-17: Thread-First Agent UX with Streaming

### Decision

Use a thread-first chat surface as the primary agent interaction model and stream assistant text tokens to the UI via a dedicated streaming route.

### Why

- The model naturally asks follow-up questions when user intent is underspecified.
- A chat transcript is the most stable UX for multi-turn planning and approval workflows.
- Streaming improves perceived latency even when backend orchestration includes storage and policy steps.

### Revisit Conditions

Revisit if:

1. A task-centric UI outperforms chat for the dominant user workflows.
2. Production telemetry shows streaming overhead or complexity outweighs UX gains.

---
Signed by: Codex (GPT-5)
Date: 2026-02-19
