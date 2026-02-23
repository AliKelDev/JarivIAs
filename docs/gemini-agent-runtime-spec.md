# Gemini Agent Runtime Spec

Last updated: 2026-02-23

This document defines the current runtime contract for agent execution routes.

## 1. Routes

- `POST /api/agent/run`
- `POST /api/agent/run/stream`

Both routes require authenticated Firebase session cookies.

## 2. Request Contract

```json
{
  "prompt": "string (required)",
  "threadId": "string (optional)",
  "conversation": [
    { "role": "user | assistant", "text": "string" }
  ],
  "attachedContext": [
    {
      "type": "email | calendar_event",
      "id": "string",
      "title": "string (optional)",
      "snippet": "string (optional)",
      "meta": { "any": "json" }
    }
  ]
}
```

Normalization:
- `conversation` is sanitized and bounded.
- `attachedContext` is sanitized and capped.

## 3. Non-Streaming Response Shape

```json
{
  "ok": true,
  "runId": "string",
  "actionId": "string",
  "threadId": "string",
  "status": "completed | awaiting_confirmation | failed",
  "summary": "string",
  "mode": "assistant_text | tool_call | approval_required",
  "model": "string",
  "tool": "string (optional)",
  "toolArgs": { "...": "json" },
  "approval": {
    "id": "string",
    "tool": "string",
    "reason": "string",
    "preview": "string"
  },
  "output": { "...": "json" }
}
```

## 4. Streaming Events (NDJSON)

- `{"type":"status","status":"planning","threadId":"..."}`
- repeated `{"type":"delta","delta":"..."}`
- `{"type":"result","result":{...}}`
- or `{"type":"error","error":"..."}`

Content type: `application/x-ndjson`.

## 5. Runtime States

Run states:
- `queued`
- `planning`
- `awaiting_confirmation`
- `executing`
- `completed`
- `failed`

Action states:
- `planned`
- `awaiting_confirmation`
- `executing`
- `completed`
- `failed`
- `rejected`

## 6. Core Execution Loop

1. Authenticate user and ensure thread ownership.
2. Persist prompt + run bootstrap state.
3. Build run-level system instruction:
   - persona + reliability rules
   - `[ABOUT THE USER]` memory/profile block
   - optional `[ATTACHED CONTEXT]` block
4. Call Gemini with tool declarations.
5. On tool call:
   - validate args
   - evaluate policy
   - if approval required, persist pending action and return
   - else execute tool, persist result, append context back into planner loop
6. Continue loop until final assistant text, approval stop, failure, or max step limit.

Loop limit:
- env var `AGENT_MAX_LOOP_STEPS`
- default `8`, clamp `1..15`

## 7. Tool Set (Current)

- `gmail_draft_create`
- `gmail_send`
- `gmail_thread_read`
- `calendar_event_create`
- `calendar_event_update`
- `calendar_search`
- `save_memory`
- `search_memory`
- `slack_channels`
- `slack_read`

## 8. Policy Rules (Current)

Trust-level based policy in `lib/agent/policy.ts`:
- `supervised`: all side effects require approval.
- `delegated`: side effects require approval except allowlisted Gmail recipients.
- `autonomous`: side effects allowed.

Global override:
- `AGENT_SIDE_EFFECTS_ENABLED=false` => deny all side-effect tools.

## 9. Data Persistence

Primary write targets:
- `runs/{runId}`
- `runs/{runId}/actions/{actionId}`
- `threads/{threadId}` and message subcollection
- `users/{uid}/agentApprovals/{approvalId}`
- `audit/{auditId}` for side-effect events

## 10. Failure and Safety Guarantees

- Invalid tool args fail fast with explicit error.
- Missing integration credentials return safe user-facing errors.
- Memory context failures do not block a run.
- Streaming errors emit `error` event and close stream cleanly.

---
Signed by: Codex (GPT-5)
Date: 2026-02-23
