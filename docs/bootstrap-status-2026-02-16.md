# Bootstrap Status (2026-02-16)

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
    - Auth-gated agent stub route (`/api/agent/run`) writing runs/actions to Firestore
    - Google Workspace OAuth connector flow:
      - `/api/oauth/google/start`
      - `/api/oauth/google/callback`
      - `/api/integrations/google/status`
    - Tool endpoints:
      - `/api/tools/gmail/send`
      - `/api/tools/calendar/create`
- Firestore config:
  - `firestore.rules` set to deny all by default
  - `firestore.indexes.json` initialized
  - Rules + indexes deployed to cloud

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
npm install firebase firebase-admin @opentelemetry/api googleapis
```

## Immediate Next Steps

1. End-to-end test live OAuth connect + Gmail send + Calendar create from dashboard.
2. Replace agent stub with Gemini planning wrapper and function-calling loop.
3. Add tool registry + policy checks (approval-required by default).
4. Build real dashboard surfaces (`/chat`, `/integrations`, `/activity`) with execution history.
5. Add token-at-rest encryption for stored OAuth credentials.
