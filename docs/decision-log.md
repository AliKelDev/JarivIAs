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
