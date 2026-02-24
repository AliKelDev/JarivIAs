# Gmail Drafts Tool Spec

Author: Claude (Sonnet 4.6), updated by Codex (GPT-5)
Last updated: 2026-02-24

Related checklist item: `docs/gemini-execution-checklist.md` tool verification for `gmail_draft_create`

Implementation status (2026-02-24):
- Implemented in runtime and tool registry.
- Dashboard right rail includes recent drafts + confirm-send flow.
- OAuth scope set includes `https://www.googleapis.com/auth/gmail.compose`.

---

## 1. Purpose

`gmail_draft_create` lets Alik compose a draft email in the user's Gmail without sending it. This
is the preferred action when:

- The user has not explicitly asked to send.
- The content is sensitive/complex and should be reviewed.
- Alik is acting proactively and confidence is not high enough for a send.
- Trust/policy settings would require approval for send anyway.

Drafts are non-destructive and keep user control before anything reaches a recipient.

---

## 2. OAuth Scope

The Google OAuth scope list currently includes:
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.compose`

`gmail.compose` is required for draft create/list/send workflows.

If scopes are changed in the future, users may need to reconnect Google to grant new permissions.

---

## 3. Gmail API Call

Create draft endpoint:
- `POST https://gmail.googleapis.com/gmail/v1/users/me/drafts`

Request body:

```json
{
  "message": {
    "raw": "<base64url-encoded RFC 2822 message>"
  }
}
```

The RFC 2822 message format:

```text
From: me
To: recipient@example.com
Subject: Hello
Content-Type: text/plain; charset="UTF-8"

Body text here.
```

This must be encoded as base64url (not standard base64).

---

## 4. Tool Definition

```ts
const gmailDraftCreate: ToolDefinition<GmailDraftArgs> = {
  name: "gmail_draft_create",
  sideEffect: false,
  defaultApproval: "not_required",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string" },
      subject: { type: "string" },
      bodyText: { type: "string" }
    },
    required: ["to", "subject", "bodyText"]
  }
};

type GmailDraftArgs = {
  to: string;
  subject: string;
  bodyText: string;
};
```

---

## 5. Policy Decision

`sideEffect: false` for this tool. A draft does not contact any recipient.

Policy should allow draft creation without approval. This makes drafting the safe default when
send intent is ambiguous.

---

## 6. Tool Response

On success, return:

```ts
{
  draftId: string;
  subject: string;
  to: string;
  gmailLink: string; // https://mail.google.com/mail/#drafts/<draftId>
}
```

UI renders this as an action/result card and refreshes right-rail drafts.

---

## 7. Relationship to `gmail_send`

| | `gmail_draft_create` | `gmail_send` |
|---|---|---|
| Reaches recipient | No | Yes |
| Side effect | No | Yes |
| Requires approval | Never | Default yes |
| Trust level needed | None | Allowlist or explicit approval |
| Reversible | Yes (user can delete) | No |

Alik should prefer drafts when in doubt.

---

## 8. Current Implementation Map

- OAuth scopes: `web/src/lib/google/oauth.ts`
- Gmail helpers: `web/src/lib/tools/gmail.ts`
- Tool declaration + validation: `web/src/lib/agent/tool-registry.ts`
- Draft list API: `web/src/app/api/tools/gmail/drafts/route.ts`
- Draft send API: `web/src/app/api/tools/gmail/drafts/send/route.ts`
- Right rail draft UI/actions: `web/src/app/dashboard/components/right-rail.tsx`
- Workspace data refresh flow: `web/src/app/dashboard/hooks/use-workspace-data.ts`

---

## 9. Non-Goals (Current)

- HTML email body support
- Attachments
- Draft editing/versioning workflows
