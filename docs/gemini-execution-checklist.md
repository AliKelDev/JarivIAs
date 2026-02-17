# Gemini Execution Checklist

Last updated: 2026-02-17

This checklist is the practical runbook for implementing Gemini in the current portal codebase.

## 1. Pre-Implementation Checks

- [ ] Confirm current branch is clean enough for new work.
- [ ] Confirm `main` is up to date locally.
- [ ] Confirm Firebase App Hosting deployment is healthy.
- [ ] Confirm OAuth Gmail/Calendar flows still work before agent refactor.

## 2. Cloud and IAM Setup

- [ ] Confirm Vertex AI API is enabled:

```bash
gcloud services enable aiplatform.googleapis.com --project jariv-agentic-portal-26-148
```

- [ ] Grant App Hosting runtime service account Vertex AI usage:

```bash
PROJECT_ID="jariv-agentic-portal-26-148"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:firebase-app-hosting-compute@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

Notes:

- The App Hosting docs describe this runtime service account pattern.
- If principle-of-least-privilege requirements tighten later, replace broad roles with narrower custom roles.

## 3. Dependencies and Config

- [ ] Install Gemini SDK:

```bash
cd web
npm install @google/genai
```

- [ ] Add runtime env vars in `web/apphosting.yaml`:
  - `GOOGLE_GENAI_USE_VERTEXAI=true`
  - `GOOGLE_CLOUD_PROJECT=jariv-agentic-portal-26-148`
  - `GOOGLE_CLOUD_LOCATION=us-central1`
  - `GEMINI_MODEL=gemini-2.5-flash`

- [ ] Keep Gemini calls server-side only (never browser-exposed).

## 4. Code Implementation Steps

- [ ] Create `web/src/lib/agent/types.ts` for shared runtime types.
- [ ] Create `web/src/lib/agent/gemini-client.ts`:
  - initialize `GoogleGenAI` client
  - define `generatePlan()` with typed output handling
- [ ] Create `web/src/lib/agent/tool-registry.ts`:
  - register `gmail_send`
  - register `calendar_event_create`
- [ ] Create `web/src/lib/agent/policy.ts`:
  - central approval decisions
  - allowlist lookups
- [ ] Create `web/src/lib/agent/orchestrator.ts`:
  - planning loop
  - state transitions
  - action persistence
- [ ] Refactor `web/src/app/api/agent/run/route.ts` to use orchestrator.

## 5. Approval Unification

- [ ] Keep existing Gmail approval flow operational during migration.
- [ ] Move decision logic into shared policy functions.
- [ ] Ensure all side-effect tools pass through the same policy gate.
- [ ] Add explicit run state `awaiting_confirmation` with resumable payload.

## 6. Testing Checklist

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Manual smoke tests:
  - prompt with no tool call
  - prompt that proposes Gmail send -> approval required
  - reject path
  - approve once path
  - approve+allow-recipient path
  - calendar create path
- [ ] Verify Firestore entries for `runs`, `actions`, `audit`.
- [ ] Verify no secrets/tokens are logged.

## 7. Deployment Checklist

- [ ] Deploy App Hosting:

```bash
firebase deploy --only apphosting --project jariv-agentic-portal-26-148
```

- [ ] Verify live endpoint health:
  - `/login`
  - `/dashboard`
  - `/api/integrations/google/status`
  - `/api/agent/run`

- [ ] Run one end-to-end production smoke test with real approval flow.

## 8. Rollback Plan

- [ ] Keep previous known-good deploy reference.
- [ ] Feature-flag Gemini orchestration if needed.
- [ ] If incident occurs:
  - disable side-effect tools
  - route back to deterministic/manual tool paths
  - redeploy last stable revision

## 9. Definition of Done

- [ ] `/api/agent/run` uses Gemini planning in production.
- [ ] Gmail and Calendar tool calls execute through one policy/approval path.
- [ ] All side-effect actions are auditable and recoverable.
- [ ] Smoke tests pass on hosted deployment.

## 10. References

- Gemini function calling docs: https://ai.google.dev/gemini-api/docs/function-calling
- Google Gen AI JS SDK: https://github.com/googleapis/js-genai
- Firebase App Hosting runtime service account docs:
  https://firebase.google.com/docs/app-hosting/configure#configure_an_app_hosting_backend_s_service_account
- Gemini skills repo:
  https://github.com/google-gemini/gemini-skills
