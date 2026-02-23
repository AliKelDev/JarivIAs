# Gmail Drafts Tool Spec

Author: Claude (Sonnet 4.6)
Last updated: 2026-02-23

Related checklist item: `execution-playbook.md` Phase 2 — `gmail_draft_create`

Implementation status (2026-02-23):
- Implemented in runtime and tool registry.
- Dashboard includes recent drafts panel and send-draft action flow.

---

## 1. Purpose

`gmail_draft_create` lets Alik compose a draft email in the user's Gmail without sending it. This
is the preferred action when:

- The user hasn't explicitly said "send"
- The content is sensitive or complex and benefits from review
- Alik is acting proactively (the user hasn't asked, but Alik thinks a reply is warranted)
- The user's trust level for the recipient doesn't yet permit auto-send

A draft is a non-destructive, reversible action — the user retains full control before anything
reaches the recipient.

---

## 2. OAuth Scope

The existing Gmail OAuth flow requests:
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`

Creating drafts requires adding:
- `https://www.googleapis.com/auth/gmail.compose`

`gmail.compose` grants: create, read, update, and delete drafts + send messages. It does NOT grant
access to read existing messages (that's `gmail.readonly`). Adding this scope is additive — it does
not remove any existing access.

**Action required:** Add `gmail.compose` to the OAuth scope list in `lib/google/oauth.ts` and
update the OAuth consent screen in GCP.

Note: Users who have already granted OAuth access will need to re-authorize to pick up the new
scope. Plan a re-auth prompt in the integration health check UI.

---

## 3. Gmail API Call

Endpoint: `POST https://gmail.googleapis.com/gmail/v1/users/me/drafts`

Request body:
```json
{
  "message": {
    "raw": "<base64url-encoded RFC 2822 message>"
  }
}
```

The RFC 2822 message format:
```
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
  description:
    "Creates a draft email in the user's Gmail inbox. Use this when composing a message " +
    "that the user should review before sending, or when auto-send is not appropriate.",
  sideEffect: false,   // Does not affect any external recipient — draft stays in Gmail
  defaultApproval: "not_required",
  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Recipient email address"
      },
      subject: {
        type: "string",
        description: "Email subject line"
      },
      body: {
        type: "string",
        description: "Plain text email body"
      },
      replyToMessageId: {
        type: "string",
        description: "Optional Gmail message ID to thread this draft as a reply to"
      }
    },
    required: ["to", "subject", "body"]
  },
  execute: async (ctx, args) => {
    // Build RFC 2822 message, base64url-encode, POST to Gmail drafts API
    // Return { draftId, subject, to, previewUrl }
  }
};

type GmailDraftArgs = {
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
};
```

---

## 5. Policy Decision

`sideEffect: false` — a draft is private to the user's mailbox and never reaches the recipient.

Policy engine should always `allow` this tool without approval. This makes `gmail_draft_create`
the low-friction path Alik defaults to unless the user or context explicitly asks to send.

---

## 6. Tool Response

On success, return:

```ts
{
  draftId: string;
  subject: string;
  to: string;
  gmailLink: string;   // https://mail.google.com/mail/#drafts/<draftId>
}
```

The UI should render this as a card: "Draft created — [subject] to [to]. Open in Gmail →"

---

## 7. Relationship to `gmail_send`

| | `gmail_draft_create` | `gmail_send` |
|---|---|---|
| Reaches recipient | No | Yes |
| Side effect | No | Yes |
| Requires approval | Never | Default yes |
| Trust level needed | None | Allowlist or explicit approval |
| Reversible | Yes (user can delete) | No |

Alik should prefer drafts when in doubt. The prompt to Gemini should make this explicit:
"If the user wants a message written but has not clearly said to send it, create a draft."

---

## 8. Implementation Path

1. Add `gmail.compose` to OAuth scopes in `lib/google/oauth.ts`
2. Add `buildRfc2822Message(args)` helper to `lib/tools/gmail.ts`
3. Add `createDraft(client, raw)` function using `gmail.users.drafts.create`
4. Register `gmail_draft_create` tool in `lib/agent/tool-registry.ts`
5. Update system prompt to prefer drafts over sends when intent is ambiguous
6. Add draft confirmation card to dashboard UI
7. Update OAuth consent screen in GCP console
8. Test re-auth flow for existing users

---

## 9. Non-Goals (V1)

- HTML email body (plain text only for now)
- Attachment support
- Draft editing/updating after creation
- Draft listing or browsing
