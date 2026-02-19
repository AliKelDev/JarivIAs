# Bootstrap Status (2026-02-16)

Last updated: 2026-02-17

## Current Owner Context

- Primary Google account for this build: `j.montee.ls@gmail.com`
- Active GCP/Firebase project: `jariv-agentic-portal-26-148`
- Project display name: `Jariv Agentic Portal`

## Provisioned Cloud Resources

- Billing linked: `billingAccounts/<REDACTED>`
- Firestore database:
  - Database ID: `(default)`
  - Type: `FIRESTORE_NATIVE`
  - Location: `nam5`
- Firebase App Hosting backend:
  - Backend ID: `jariv-portal-web`
  - Region: `us-central1`
  - URL: `https://jariv-portal-web--jariv-agentic-portal-26-148.us-central1.hosted.app`
- Firebase web app:
  - Display name: `jariv-portal-web`
  - App ID: `1:56837497601:web:233e8dbdae86e7231c7100`

## Enabled Core APIs

- `aiplatform.googleapis.com`
- `cloudbuild.googleapis.com`
- `cloudscheduler.googleapis.com`
- `cloudtasks.googleapis.com`
- `firebase.googleapis.com`
- `firebaseapphosting.googleapis.com`
- `firestore.googleapis.com`
- `identitytoolkit.googleapis.com`
- `run.googleapis.com`
- `secretmanager.googleapis.com`

## Local Repo State

- Firebase initialized in repo root:
  - `.firebaserc` points to `jariv-agentic-portal-26-148`
  - `firebase.json` configured for App Hosting + Firestore
- App Hosting app root:
  - `web/`
  - `web/apphosting.yaml`
- Web app scaffold:
  - Next.js app generated in `web/`
  - Production build passes locally
  - Live deployment includes:
    - `/login` Google sign-in page
    - Session cookie auth routes (`/api/auth/session-login`, `/api/auth/session-logout`)
    - Protected `/dashboard` page
    - Gemini-backed agent routes:
      - `/api/agent/run`
      - `/api/agent/run/stream` (NDJSON token streaming)
      - `/api/agent/thread` (thread messages + pending approvals)
      - `/api/agent/approvals/pending`
      - `/api/agent/approvals/resolve`
    - Google Workspace OAuth connector flow:
      - `/api/oauth/google/start`
      - `/api/oauth/google/callback`
      - `/api/integrations/google/status`
    - Tool endpoints:
      - `/api/tools/gmail/send`
      - `/api/tools/calendar/create`
      - `/api/tools/gmail/approval/request`
      - `/api/tools/gmail/approval/resolve`
  - Dashboard updates:
    - Agent chat thread with persisted conversation history.
    - Streaming assistant output during run execution.
    - In-chat approval cards for side-effect actions.
    - Manual Gmail approval UX retained for deterministic testing.
    - Readability fixes for dashboard text/colors
- Firestore config:
  - `firestore.rules` set to deny all by default
  - `firestore.indexes.json` initialized
  - Rules + indexes deployed to cloud

## Vertex AI Runtime Access

- Vertex API enabled and validated for the project.
- App Hosting runtime service account verified:
  - `firebase-app-hosting-compute@jariv-agentic-portal-26-148.iam.gserviceaccount.com`
- IAM role granted for Gemini runtime:
  - `roles/aiplatform.user`

## Repo Hygiene and Push Status (2026-02-17)

- Root `.gitignore` hardened for local secrets/artifacts:
  - `.env.*`, `*.local`, key/cert files, service-account/client-secret JSON patterns
- Private story kept local only:
  - `docs/wake-up-story.md` is ignored by git
- Web ignore adjusted to allow committing example env template:
  - `web/.gitignore` includes `!.env.example`
- Commit and push:
  - Commit: `1f07408`
  - Branch: `main`
  - Remote: `origin/main`

## Commands Already Run Successfully

```bash
gcloud projects create jariv-agentic-portal-26-148 --name "Jariv Agentic Portal"
gcloud billing projects link jariv-agentic-portal-26-148 --billing-account <BILLING_ACCOUNT_ID>
gcloud services enable <required APIs...>
gcloud firestore databases create --project=jariv-agentic-portal-26-148 --location=nam5 --type=firestore-native
gcloud services enable gmail.googleapis.com calendar-json.googleapis.com people.googleapis.com

firebase projects:addfirebase jariv-agentic-portal-26-148
firebase apphosting:backends:create --project jariv-agentic-portal-26-148 --backend jariv-portal-web --primary-region us-central1
firebase apphosting:secrets:set GOOGLE_OAUTH_CLIENT_SECRET --data-file=-
firebase apphosting:secrets:grantaccess GOOGLE_OAUTH_CLIENT_SECRET --backend jariv-portal-web --location us-central1
firebase init apphosting
firebase init firestore
firebase deploy --only apphosting --project jariv-agentic-portal-26-148
firebase deploy --only firestore --project jariv-agentic-portal-26-148
npm install firebase firebase-admin @opentelemetry/api googleapis @google/genai
gcloud projects add-iam-policy-binding jariv-agentic-portal-26-148 --member="serviceAccount:firebase-app-hosting-compute@jariv-agentic-portal-26-148.iam.gserviceaccount.com" --role="roles/aiplatform.user"
gcloud auth application-default login
```

## Immediate Next Steps

1. Add dedicated Activity view with filters over runs/actions/audit.
2. Add explicit idempotency keys for side-effect action execution.
3. Add structured latency instrumentation per stage (thread read, model call, tool exec).
4. Add token-at-rest encryption for stored OAuth credentials.
5. Add integration and regression tests for stream + approval resume flow.

---
Signed by: Codex (GPT-5)
Date: 2026-02-19
