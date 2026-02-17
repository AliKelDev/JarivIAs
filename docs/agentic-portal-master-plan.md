# Agentic Portal Master Plan

Last updated: 2026-02-16

## 1. Goal

Build a web portal where users sign in with Google and use an AI assistant to perform real actions:

- Send or draft emails
- Create or update calendar events
- Send messages via a selected messaging connector

The platform should be hosted on Firebase/GCP and use Gemini for planning and tool-calling.

## 2. V1 Product Scope

### In scope

- Google login via Firebase Authentication
- Dashboard with agent chat
- Tool execution with guardrails
- Gmail draft/send support
- Google Calendar create/update support
- Activity and audit logs
- Human approval flow for side-effect actions

### Out of scope (V1)

- Multi-tenant enterprise admin suite
- Large connector catalog
- Fully autonomous “always-on” actions without approvals
- Advanced analytics warehouse

## 3. Recommended Architecture

```text
[Browser: Next.js UI]
        |
        v
[Firebase App Hosting: web/app server]
        |
        +--> [Firebase Auth: Google sign-in]
        |
        +--> [Agent Service]
               |
               +--> [Gemini model (Vertex AI or Gemini API)]
               +--> [Tool Registry + Policy Engine]
                        |
                        +--> [Gmail API]
                        +--> [Calendar API]
                        +--> [Messaging Connector]
        |
        +--> [Firestore: users, threads, runs, actions, audit]
        +--> [Secret Manager: OAuth secrets/tokens refs]
        +--> [Cloud Tasks + Scheduler: async and periodic jobs]
```

Framework decision note:

- Frontend/runtime stack for V1 is locked to `Next.js + Firebase App Hosting`.
- See `docs/decision-log.md` for rationale and revisit criteria.

## 4. Identity, Auth, and Permissions

### 4.1 User identity

- Use Firebase Authentication with Google provider for login.
- Use secure session cookies for server-side requests.

### 4.2 API action permissions

- Use separate OAuth flow for Gmail and Calendar scopes.
- Request only minimal required scopes.
- Store refresh/access token metadata securely.

### 4.3 Authorization model

- Roles:
  - `owner`
  - `admin`
  - `member`
- Policy controls:
  - Which tools each role can use
  - Which actions require explicit approval
  - Daily/weekly action limits

## 5. Agent Runtime Model

### 5.1 Core loop

1. Receive user intent.
2. Ask Gemini for next action or response.
3. If tool call is proposed, validate schema.
4. Apply policy checks (authorization + risk rules).
5. If approval required, pause with action card.
6. Execute tool action.
7. Persist results and continue loop.
8. Return final response and action summary.

### 5.2 Run lifecycle states

- `queued`
- `planning`
- `awaiting_confirmation`
- `executing`
- `completed`
- `failed`

### 5.3 Reliability controls

- Idempotency keys for any side-effect action
- Retry strategy for transient failures
- Structured error classes (auth, validation, API, timeout)
- Full action trace persistence for debugging

## 6. Tooling Strategy

Start with a narrow and safe tool set:

1. `gmail_draft_create`
2. `gmail_send`
3. `calendar_event_create`
4. `calendar_event_update`

Then add one messaging connector after stability targets are met.

Each tool adapter should include:

- Input schema validation
- Authorization checks
- Connector execution
- Normalized result shape
- Error mapping

## 7. Dashboard UX Plan

### Main pages

- Chat
- Tasks
- Integrations
- Activity
- Settings

### Critical UI behavior

- Display proposed actions before execution
- Require explicit confirmation for risky actions
- Show deterministic result records (success/failure + metadata)
- Show recent actions and pending approvals in dashboard widgets

## 8. Data Model (Firestore)

### Collections

- `users/{uid}`
  - Role, profile, preferences
- `users/{uid}/integrations/{provider}`
  - Connection state, scopes, token metadata, secret reference
- `threads/{threadId}`
  - Ownership, summary, updated timestamps
- `threads/{threadId}/messages/{messageId}`
  - Role, content, tool markers
- `runs/{runId}`
  - State, timeline, failure details
- `runs/{runId}/actions/{actionId}`
  - Tool, params hash, confirmation state, result metadata
- `audit/{auditId}`
  - Immutable security and operation audit events

## 9. Security and Compliance Requirements

- Principle of least privilege for OAuth scopes
- No raw tokens in logs
- Sensitive values in Secret Manager
- Encryption at rest and controlled key access
- Action throttling and abuse protections
- “Global kill switch” to disable all side-effect tools
- OAuth app verification prep:
  - Product home page
  - Privacy policy
  - Terms of service
  - Scope justification and demo evidence

## 10. Deployment and Infrastructure Plan

### Core stack

- Firebase App Hosting for the app
- Firestore for app state
- Secret Manager for sensitive config
- Cloud Tasks for async execution
- Cloud Scheduler for periodic jobs
- Cloud Logging/Monitoring for operations

### CI/CD expectations

- PR checks:
  - Lint
  - Type check
  - Unit tests
  - Integration tests (mocked minimum)
- Preview deployments for branches
- Controlled production rollouts

## 11. Phased Delivery Roadmap

### Phase 0: Foundations (2-3 days)

- Initialize repo and app skeleton
- Configure Firebase App Hosting
- Implement Google login and sessions
- Build dashboard shell

### Phase 1: Agent core (4-6 days)

- Gemini-based function calling loop
- Tool registry and policy engine
- Persistent run/action state machine

### Phase 2: Gmail + Calendar (4-7 days)

- OAuth connector flows
- Token lifecycle handling
- Gmail and Calendar adapters

### Phase 3: Approval + Audit (3-5 days)

- Human-in-the-loop confirmation flow
- Action cards in UI
- Full audit stream

### Phase 4: Reliability (3-4 days)

- Queueing and retries
- Idempotency guarantees
- Failure recovery paths

### Phase 5: Hardening and Launch (3-5 days)

- Security review
- OAuth verification readiness
- Monitoring and alert policies
- Load/cost checks

### Phase 6: Expansion (ongoing)

- Add connectors
- Add scheduled automations
- Add team collaboration features

## 12. Major Risks and Mitigations

### OAuth verification delay

- Mitigation: build with test users while verification is in progress.

### Accidental autonomous side effects

- Mitigation: default to approval-required mode.

### Token/security incidents

- Mitigation: strict secret management + redacted logs + least privilege.

### Cost spikes

- Mitigation: daily quotas, tool-rate limits, billing alerts.

### Tool-call drift

- Mitigation: strict JSON schemas and deterministic validators.

## 13. Success Criteria for V1

- User can sign in with Google and reach dashboard.
- User can ask agent to draft/send an email with approval gate.
- User can ask agent to create/update calendar events with approval gate.
- Every tool action is visible in Activity/Audit log.
- System retries safely without duplicate side effects.
- Core uptime and error alerts are configured.

## 14. First Build Order

1. Lock V1 scope to Gmail + Calendar only.
2. Scaffold Next.js app and Firebase App Hosting.
3. Implement login and session handling.
4. Implement one complete end-to-end path:
   - Prompt -> planned action -> approval -> calendar create -> logged result
5. Add Gmail flow.
6. Add queue/retry/idempotency.
7. Prepare OAuth verification artifacts.
