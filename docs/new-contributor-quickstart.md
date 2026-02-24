# New Contributor Quickstart

This is the fastest path to understand and run the portal safely.

## 1. Ground Rules

- Read `docs/AGENTS.md` before claiming work.
- Follow `docs/AGENTS.md` Team Rules (file-boundary claim, non-owned-file hard stop, path-scoped staging).
- Do not overlap claimed tasks without coordination.
- Never commit secrets or OAuth tokens.
- Keep docs updated when behavior changes.

## 2. Local Setup

Prereqs:
- Node 20+
- Firebase CLI
- gcloud CLI

Install deps:

```bash
cd web
npm install
```

Create local env:

```bash
cp .env.example .env.local
```

Fill required values in `web/.env.local`:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `GOOGLE_OAUTH_CLIENT_SECRET`

`web/.env.example` already contains project defaults for the remaining Firebase/Vertex values.

Optional local-only overrides:
- `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `AGENT_MAX_LOOP_STEPS` (default `8`, clamped `1..15`)
- `AGENT_SIDE_EFFECTS_ENABLED` (`true`/`false`)
- `GOOGLE_GENAI_USE_VERTEXAI` (`true` by default; can use API key mode if false)

## 3. Run Locally

```bash
cd web
npm run dev
```

Open:
- `http://localhost:3000/landing`
- sign in via `/login`
- onboarding gate routes first-time users to `/onboarding`
- completed users land on `/dashboard`

## 4. Fast Smoke Test

1. Sign in and ensure dashboard loads.
2. Confirm Google integration status shows connected.
3. Send a chat prompt and verify streaming text appears.
4. Verify thought/tool-call stream events appear while Alik plans.
5. Trigger a side-effect tool path and verify approval card appears.
6. Approve once and confirm run completes.
7. Check Workspace Pulse loads calendar/inbox data.
8. Check memory panel loads and delete action works.
9. Check history panel loads thread list pagination.
10. Check right rail draft send confirm flow works and refreshes workspace.

## 5. Important Runtime Surfaces

Core APIs:
- `web/src/app/api/agent/run/route.ts`
- `web/src/app/api/agent/run/stream/route.ts`
- `web/src/app/api/agent/approvals/resolve/route.ts`
- `web/src/app/api/agent/thread/route.ts`
- `web/src/app/api/agent/threads/route.ts`

Agent runtime:
- `web/src/lib/agent/orchestrator.ts`
- `web/src/lib/agent/gemini-client.ts`
- `web/src/lib/agent/tool-registry.ts`
- `web/src/lib/agent/policy.ts`

Integrations:
- `web/src/lib/tools/gmail.ts`
- `web/src/lib/tools/calendar.ts`
- `web/src/lib/tools/slack.ts`

Memory and trust:
- `web/src/lib/memory/`
- `web/src/lib/agent/trust.ts`

UI:
- `web/src/app/dashboard/dashboard-client.tsx`
- `web/src/app/dashboard/components/left-sidebar.tsx`
- `web/src/app/dashboard/components/right-rail.tsx`
- `web/src/app/dashboard/hooks/use-chat-runner.ts`
- `web/src/app/dashboard/hooks/use-workspace-data.ts`
- `web/src/app/dashboard/hooks/use-agent-trust.ts`
- `web/src/app/dashboard/hooks/use-thread-history.ts`
- `web/src/app/onboarding/onboarding-client.tsx`

## 6. Firestore + Indexes

Required composite indexes are tracked in `firestore.indexes.json`:
- `runs(uid ASC, createdAt DESC)`
- `threads(uid ASC, updatedAt DESC)`

Deploy indexes when changed:

```bash
firebase deploy --only firestore:indexes
```

## 7. Deploy Notes

- App Hosting config is in `web/apphosting.yaml`.
- Client Firebase API key is intentionally public-facing but should still be restricted in Google Cloud.
- Server secrets (`GOOGLE_OAUTH_CLIENT_SECRET`, Gemini API key when used) must stay in secrets, not git.

## 8. Source of Truth Priority

1. Code
2. `docs/AGENTS.md` (active coordination)
3. `docs/execution-playbook.md`
4. Other docs

---
Signed by: Codex (GPT-5)
Date: 2026-02-24
