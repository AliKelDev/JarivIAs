# Gemini Execution Checklist

Last updated: 2026-02-23

Use this checklist when setting up a new environment or validating production after runtime changes.

## 1. Cloud + IAM

- [ ] Vertex AI API enabled for project.
- [ ] App Hosting runtime service account exists.
- [ ] Runtime service account has `roles/aiplatform.user`.
- [ ] Firestore API + required indexes are deployed.

Reference command pattern:

```bash
PROJECT_ID="jariv-agentic-portal-26-148"
SA="firebase-app-hosting-compute@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable aiplatform.googleapis.com --project="$PROJECT_ID"
gcloud iam service-accounts describe "$SA" --project="$PROJECT_ID"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA}" \
  --role="roles/aiplatform.user"
```

## 2. Environment Configuration

- [ ] `GOOGLE_GENAI_USE_VERTEXAI=true`
- [ ] `GOOGLE_CLOUD_PROJECT` set
- [ ] `GOOGLE_CLOUD_LOCATION` set
- [ ] `GEMINI_MODEL` set (default `gemini-2.5-flash`)
- [ ] `AGENT_MAX_LOOP_STEPS` reviewed for target env
- [ ] `AGENT_SIDE_EFFECTS_ENABLED` explicitly set

## 3. Core Runtime Verification

- [ ] `POST /api/agent/run` returns valid payload.
- [ ] `POST /api/agent/run/stream` emits `status`, `delta`, and `result` events.
- [ ] Run records are written to `runs/*`.
- [ ] Action records are written to `runs/{runId}/actions/*`.
- [ ] Thread messages persist and reload correctly.

## 4. Policy + Approval Verification

- [ ] `supervised` trust level requires approval for side effects.
- [ ] `delegated` trust level auto-allows allowlisted Gmail recipients only.
- [ ] `autonomous` trust level allows side effects without approval card.
- [ ] Approval resolve route resumes pending runs correctly.

## 5. Tool Verification

- [ ] `gmail_draft_create`
- [ ] `gmail_send`
- [ ] `gmail_thread_read`
- [ ] `calendar_event_create`
- [ ] `calendar_event_update`
- [ ] `calendar_search`
- [ ] `save_memory`
- [ ] `search_memory`
- [ ] `slack_channels`
- [ ] `slack_read`

## 6. Security Verification

- [ ] No OAuth client secrets or API keys in git-tracked files.
- [ ] Session-required APIs return 401 for unauthenticated requests.
- [ ] Side-effect tools can be globally disabled with env kill switch.
- [ ] Client Firebase config values are restricted in GCP settings.

## 7. Deploy Verification

- [ ] `npm --prefix web run lint`
- [ ] `npm --prefix web run build`
- [ ] `firebase deploy --only apphosting`
- [ ] production smoke test passes with real login and one approval path

## 8. Rollback Readiness

- [ ] Last known good deploy reference available.
- [ ] Fast toggle path available: `AGENT_SIDE_EFFECTS_ENABLED=false`.
- [ ] Incident notes documented in `docs/AGENTS.md`.

---
Signed by: Codex (GPT-5)
Date: 2026-02-23
