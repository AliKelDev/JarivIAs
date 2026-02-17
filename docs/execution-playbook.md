# Execution Playbook

Last updated: 2026-02-16

This file is the operational checklist for building the agentic portal from scratch to launch.

## 1. Working Rules

- Keep scope locked to V1 until launch criteria are met.
- Every side-effect action must be auditable.
- Default to “approval required” for email sends and event updates.
- No production secrets in source control.

## 2. Pre-Flight Checklist

- [x] Confirm Firebase project exists and billing is enabled (Blaze).
- [x] Confirm GCP project is selected in `gcloud`.
- [x] Confirm `firebase`, `gcloud`, and Node toolchain versions are compatible.
- [ ] Confirm domain plan (dev + prod).
- [ ] Confirm OAuth consent screen owner and support email.

## 3. Phase-by-Phase Build Checklist

## Phase 0: Foundations

- [x] Initialize app project (Next.js recommended).
- [x] Initialize Firebase in repo.
- [x] Initialize App Hosting.
- [ ] Connect GitHub repo to App Hosting backend.
- [x] Add Firebase Auth Google sign-in.
- [x] Implement server session cookie flow.
- [ ] Build dashboard shell (Chat, Tasks, Integrations, Activity, Settings).

Definition of done:

- [ ] User can log in with Google and load authenticated dashboard.

## Phase 1: Agent Core

- [x] Implement server-side agent endpoint.
- [ ] Add Gemini model wrapper with function calling.
- [ ] Build tool registry interface.
- [ ] Add policy engine (role + approval + quotas).
- [ ] Add run state machine persistence.
- [ ] Add basic conversation/thread persistence.

Definition of done:

- [x] Prompt can create a planned tool action with persisted run state.

## Phase 2: Gmail + Calendar Connectors

- [x] Implement OAuth connect flow for Gmail + Calendar.
- [ ] Implement encrypted token storage strategy.
- [x] Add token refresh logic and revocation handling.
- [ ] Build `gmail_draft_create`.
- [x] Build `gmail_send`.
- [x] Build `calendar_event_create`.
- [ ] Build `calendar_event_update`.
- [ ] Add connector health checks and error mapping.

Definition of done:

- [ ] Agent can complete one Gmail action and one Calendar action end-to-end.

## Phase 3: Approval + Audit

- [ ] Build UI action confirmation cards.
- [ ] Pause runs in `awaiting_confirmation`.
- [ ] Resume runs after user approval.
- [ ] Add immutable audit event writes.
- [ ] Expose Activity view with filters.

Definition of done:

- [ ] All side-effect actions require approval and produce audit events.

## Phase 4: Reliability

- [ ] Move tool execution to async queue where needed.
- [ ] Add idempotency keys for side-effect actions.
- [ ] Add retry policy for transient API errors.
- [ ] Add dead-letter or failure inspection path.
- [ ] Add timeout and circuit-breaker policies.

Definition of done:

- [ ] Retries do not produce duplicate external side effects.

## Phase 5: Hardening + Launch

- [ ] Security review of scopes, logs, and secret handling.
- [ ] Add monitoring dashboards and alerts.
- [ ] Add budget and spend alerts.
- [ ] Complete OAuth verification artifacts.
- [ ] Load test critical paths.
- [ ] Run production readiness checklist.

Definition of done:

- [ ] System is ready for controlled production rollout.

## 4. Suggested Command Checklist

Use these as templates; adapt names/regions/project IDs.

```bash
# Firebase login and project selection
firebase login
firebase use <firebase-project-id>

# Initialize features
firebase init apphosting
firebase init firestore

# App Hosting backend creation
firebase apphosting:backends:create --backend <backend-name> --primary-region <region>

# Set App Hosting secrets
firebase apphosting:secrets:set GEMINI_API_KEY
firebase apphosting:secrets:set GOOGLE_OAUTH_CLIENT_SECRET

# Rollout from branch
firebase apphosting:rollouts:create <backend-id> --git-branch main
```

```bash
# GCP service enablement
gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com cloudtasks.googleapis.com aiplatform.googleapis.com

# Secret Manager examples
printf "value" | gcloud secrets create my-secret --data-file=-
printf "newvalue" | gcloud secrets versions add my-secret --data-file=-

# Scheduler example (for periodic sync or cleanup)
gcloud scheduler jobs create http portal-maintenance \
  --location=<region> \
  --schedule="0 */6 * * *" \
  --uri="https://<service-url>/jobs/maintenance" \
  --http-method=POST \
  --oidc-service-account-email=<service-account>
```

## 5. Test Strategy Checklist

- [ ] Unit tests for policy engine.
- [ ] Unit tests for each tool adapter.
- [ ] Contract tests for tool schema validation.
- [ ] Integration tests for OAuth callback and token refresh.
- [ ] Integration tests for Gmail/Calendar sandbox or test accounts.
- [ ] End-to-end tests for approval workflow.
- [ ] Regression tests for duplicate-send prevention.

## 6. Release Checklist

- [ ] Migrations and indexes prepared.
- [ ] Secrets present in target environment.
- [ ] OAuth redirect URIs match deployed domains.
- [ ] Alerts and error reporting active.
- [ ] Rollback plan tested.
- [ ] Release notes and known limitations documented.

## 7. Weekly Operating Cadence

### Monday planning

- [ ] Choose one phase goal for the week.
- [ ] Break work into small, testable tasks.
- [ ] Confirm dependencies and owner.

### Daily execution

- [ ] Ship at least one vertical slice or defect fix daily.
- [ ] Update checklist status in this file.
- [ ] Record any architectural decisions or scope changes.

### Friday review

- [ ] Demo working flow.
- [ ] Review risks and incidents.
- [ ] Re-prioritize next week tasks.

## 8. Change Log Template

Use this section to keep a running record.

```md
## YYYY-MM-DD
- Completed:
- Blockers:
- Decisions:
- Next:
```
