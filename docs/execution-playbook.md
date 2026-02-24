# Execution Playbook

Last updated: 2026-02-24

This is the current operator runbook for implementing, validating, and shipping work.

## 1. Working Rules

- Check `docs/AGENTS.md` before claiming work.
- Avoid parallel edits in the same files unless coordinated.
- Preserve approval gates for side-effect tools.
- Keep secrets out of source control.
- If behavior changes, update docs in the same PR/commit.

## 2. Daily Developer Loop

1. Sync and inspect current changes:

```bash
git status --short
```

If non-owned modified files exist, stop and coordinate in `docs/AGENTS.md` before staging.

2. Run local checks before and after edits:

```bash
npm --prefix web run lint
npm --prefix web run build
```

3. Validate a real user flow in the dashboard.
4. Update `docs/AGENTS.md` with implementation note if working in multi-agent mode.
5. Stage only explicit owned paths:

```bash
git add <explicit-paths-only>
```

## 3. Runtime Health Checklist

- [x] Firebase Auth Google login + session cookie flow.
- [x] Onboarding gating (`/onboarding`) before dashboard access.
- [x] Gemini run route (`/api/agent/run`) operational.
- [x] Streaming route (`/api/agent/run/stream`) operational.
- [x] Stream emits `delta`, `thought_delta`, and `tool_call` events.
- [x] Approval pause/resume flow operational.
- [x] Thread history + message retrieval operational.
- [x] Activity panel query operational.
- [x] Morning briefing prepare + stream operational.
- [x] Memory APIs (read/delete) operational.
- [x] Slack token settings API operational.

## 4. Data and Infra Checklist

- [x] Firestore rules + indexes tracked in repo.
- [x] Composite index: `runs(uid, createdAt desc)`.
- [x] Composite index: `threads(uid, updatedAt desc)`.
- [x] Vertex AI API enabled.
- [x] App Hosting runtime service account has `roles/aiplatform.user`.

## 5. Required Secrets / Env

Client-facing env (still required at runtime/build):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`

Server runtime config:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_GENAI_USE_VERTEXAI`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`

Server secrets:
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) only when not using Vertex IAM auth

Runtime controls:
- `GEMINI_MODEL`
- `AGENT_MAX_LOOP_STEPS`
- `AGENT_SIDE_EFFECTS_ENABLED`

## 6. Pre-Deploy Checklist

- [ ] `npm --prefix web run lint` passes.
- [ ] `npm --prefix web run build` passes.
- [ ] OAuth redirect URIs include localhost + hosted domain.
- [ ] App Hosting secrets present.
- [ ] Firestore indexes deployed.
- [ ] Manual smoke test covers login, chat, approvals, and one tool action.

## 7. Deploy Commands

```bash
# Optional project select
firebase use jariv-agentic-portal-26-148

# Indexes (if changed)
firebase deploy --only firestore:indexes

# App Hosting rollout
firebase deploy --only apphosting
```

## 8. Production Smoke Test

1. Open `/login` and authenticate.
2. Confirm dashboard loads without auth/session errors.
3. Send a prompt in chat and verify streaming deltas appear.
4. Trigger `gmail_send` path; verify pending approval appears.
5. Resolve approval and verify run completion appears in activity.
6. Confirm Workspace Pulse loads inbox/calendar data.
7. Confirm morning briefing endpoint returns cached/ready payload.

## 9. Incident / Rollback Basics

If critical issues appear after deploy:
1. Set `AGENT_SIDE_EFFECTS_ENABLED=false` and redeploy to disable side effects.
2. Keep chat/read-only paths available while investigating.
3. Redeploy last known-good revision if needed.
4. Record incident and fix details in `docs/AGENTS.md`.

## 10. Current Open Work Themes

Track live ownership and in-progress tasks in `docs/AGENTS.md`.
Do not treat this file as a task board.

---
Signed by: Codex (GPT-5)
Date: 2026-02-24
