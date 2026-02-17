# Gemini Agent Runtime Spec

Last updated: 2026-02-17

## 1. Purpose

Define the exact runtime behavior for the Gemini orchestrator in `web/src/app/api/agent/run/route.ts`.

## 2. Route Contract

Request (`POST /api/agent/run`):

```json
{
  "prompt": "string (required)",
  "threadId": "string (optional)"
}
```

Response (synchronous shape for V1):

```json
{
  "ok": true,
  "runId": "string",
  "threadId": "string",
  "status": "completed | awaiting_confirmation | failed",
  "summary": "string",
  "actions": [
    {
      "tool": "string",
      "status": "completed | awaiting_confirmation | failed",
      "requiresApproval": true
    }
  ]
}
```

Streaming route (`POST /api/agent/run/stream`):

- Content type: `application/x-ndjson`
- Event sequence:
  - `{"type":"status","status":"planning","threadId":"..."}`
  - repeated `{"type":"delta","delta":"..."}` events
  - final `{"type":"result","result":{...run response...}}`
  - or `{"type":"error","error":"..."}`

## 3. Runtime States

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

## 4. Core Loop

1. Validate auth/session user.
2. Ensure thread ownership and append the new user message.
3. Persist run with `queued -> planning`.
4. Call Gemini with:
   - system instructions (policy + persona)
   - recent thread conversation history
   - user prompt
   - tool declarations
5. Parse model response:
   - no tool call: produce assistant reply, mark completed
   - tool call(s): validate args and pass through policy gate
6. If approval required:
   - persist pending action
   - mark run `awaiting_confirmation`
   - append assistant approval-request message to thread
   - return pending approval payload
7. If no approval required:
   - execute tool
   - persist output + audit
   - append assistant completion message to thread
8. Finalize run with summary + timestamps.

Max loop count (V1): `3`.

## 5. Tool Registry Contract

```ts
type ToolExecutionContext = {
  uid: string;
  origin: string;
  runId: string;
  actionId: string;
};

type ToolDefinition<TArgs> = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  sideEffect: boolean;
  defaultApproval: "required" | "not_required";
  execute: (ctx: ToolExecutionContext, args: TArgs) => Promise<unknown>;
};
```

Initial tool set:

- `gmail_send`
- `calendar_event_create`

## 6. Policy Engine Contract

Input:

- user identity
- tool name
- normalized tool args
- saved allowlist/preference data

Output:

```ts
type PolicyDecision =
  | { mode: "allow" }
  | { mode: "require_approval"; reason: string }
  | { mode: "deny"; reason: string };
```

Rules (V1):

- Always require approval for side effects unless allowlist explicitly permits.
- Reject malformed or unsafe addresses/parameters before approval step.

## 7. Approval Resume Flow

Generic agent approval routes are in place:

- `/api/agent/approvals/pending`
- `/api/agent/approvals/resolve`

Behavior:

- Request stage stores `pendingAction` document keyed by `approvalId`.
- Resolve stage maps decision:
  - `reject` -> action `rejected`, run `failed` or `completed` (policy choice)
  - `approve_once` -> execute once
  - `approve_and_always_allow_recipient` -> persist allowlist + execute

## 8. Error Taxonomy

Use structured error classes:

- `ValidationError` (input schema issues)
- `AuthError` (missing scopes/session)
- `PolicyError` (blocked by policy)
- `ToolExecutionError` (provider/API failure)
- `ModelError` (Gemini call/parsing failure)

Return safe client messages. Keep sensitive payloads out of response and logs.

## 9. Observability and Audit

For each action, persist:

- `modelName`
- `toolName`
- `inputHash` (not full sensitive payload if risky)
- `policyDecision`
- `approvalId` (if any)
- `executionStatus`
- `errorCode` and sanitized message
- timestamps

Write immutable audit entries to `audit` for all side effects.

## 10. Non-Goals (V1)

- Multi-agent planning.
- Parallel tool execution.
- Unbounded autonomous loops.
- User-configurable natural-language policy authoring.

## 11. References

- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- `@google/genai` SDK: https://github.com/googleapis/js-genai
