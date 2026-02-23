# Trust & Autonomy UX

Author: Claude (Sonnet 4.6)
Last updated: 2026-02-23

Note: The technical approval/policy flow is documented in `gemini-agent-runtime-spec.md` and
`execution-playbook.md`. This doc covers the product and UX philosophy layer — why it's designed
the way it is, and how it should evolve with the user.

Implementation status (2026-02-23):
- Trust levels are implemented (`supervised`, `delegated`, `autonomous`) and configurable via onboarding + dashboard.
- Policy enforcement is active in `web/src/lib/agent/policy.ts`.
- Trust settings are persisted under `users/{uid}/settings/agent_policy`.

---

## 1. The Core Tension

Alik's value comes from autonomy. But autonomy from a stranger is alarming.

A new user who has never seen Alik act doesn't know what she'll do. Showing them a wall of approval
prompts is honest and safe, but it trains them to think of Alik as a request machine — "I ask, she
does, I approve." That's not the product.

The goal is to move users from *oversight* to *trust* naturally, so that over time Alik acts more
and the user thinks less. The UX should make this journey feel earned and obvious, not accidental.

---

## 2. The Trust Journey (Three Stages)

### Stage 1: Supervised (default for new users)

- All side-effect actions require explicit approval
- Alik explains what she's about to do before doing it
- Approval cards are prominent and easy to understand
- The framing is: "Alik proposed this. You decide."

UX goal: build confidence. User should finish Stage 1 thinking "she gets it."

### Stage 2: Delegated (after user signals comfort)

- User has approved several similar actions → system suggests "always allow for this?"
- User can configure per-tool or per-recipient bypass
- Alik acts, then notifies: "Done. I sent that email to Sarah."
- Approval cards shrink to a subtle activity log entry

UX goal: reduce friction. User should barely notice Alik working.

### Stage 3: Autonomous (user explicitly unlocks)

- User has granted broad permissions or switched on autonomous mode
- Alik acts on her own judgment without prompting
- User receives digests, not approval requests
- Escalation only on ambiguity or high-stakes decisions

UX goal: Alik feels like a background employee. User checks in, not the other way around.

---

## 3. How Users Progress Between Stages

Progression is never automatic. The system can *suggest* moving forward, but the user must consent.

Triggers for suggesting Stage 1 → Stage 2:
- User has approved 3+ actions from the same tool without rejecting
- User has approved 2+ sends to the same recipient

Triggers for suggesting Stage 2 → Stage 3:
- User manually navigates to Settings and enables it
- No automatic trigger — this is a deliberate unlock

Regression is always allowed. Any approval rejection resets the affected allowlist entry.
User can manually lower their trust level at any time from Settings.

---

## 4. The Approval Card Design Philosophy

Approval cards should communicate three things instantly:
1. **What** Alik wants to do (specific, not abstract)
2. **Why** she thinks it's the right action (one sentence)
3. **What the options are** (approve / reject / always allow)

Bad card: "Alik wants to send an email. Approve?"
Good card: "Send to sarah@example.com — 'Re: Thursday meeting' — confirming your 3pm slot. Approve once | Always allow Sarah | Reject"

The preview of the action (email subject + snippet, calendar event title + time) is mandatory.
The user should never need to open a detail view to make a decision.

---

## 5. The Notification vs. Interruption Distinction

As trust grows, Alik's communication style shifts:

| Mode | How Alik tells you she acted |
|---|---|
| Supervised | Approval card (blocks until resolved) |
| Delegated | Inline message: "Done — I sent the email." |
| Autonomous | Daily digest or push notification summary |

The UI should never surface approval cards in autonomous mode unless:
- The action failed and needs the user's input
- The action is outside previously granted permissions
- Alik herself is uncertain and is asking for guidance (this is healthy, not a failure)

---

## 6. The "Free Reigns" Onboarding Moment

During onboarding (or Settings), there should be a clear and honest screen:

> "How much should Alik do on her own?"
>
> ○ Ask me before anything — I want to review every action
> ○ Ask me for new things, act automatically for things I've approved before
> ○ Use your judgment — I trust you to act and tell me what you did
>
> You can change this anytime.

This sets the initial stage and makes the model legible. Users who pick option 3 should feel like
they're hiring someone, not enabling a script.

---

## 7. The Transparency Guarantee

No matter what trust level the user has set, Alik must always:

- Log every action she takes (visible in Activity view)
- Surface that log on demand ("what have you done today?")
- Be able to undo or surface how to undo any action she took

Autonomy doesn't mean opacity. The more autonomous Alik is, the more important the audit trail
becomes. The Activity view is not an optional power-user feature — it's the foundation of trust.

---

## 8. The Pitch Story

For the incubator presentation, the trust journey is the narrative:

"Most AI assistants ask you to do the work. Alik starts by asking permission, learns what you trust
her with, and eventually just handles it. The guardrails aren't a limitation — they're how she
earns the right to act freely."

That arc — from cautious to capable — is what makes this feel like a relationship, not a tool.

---

## 9. What This Means for the Technical Roadmap

- The policy engine needs a `trustLevel` field per user (not just per-recipient allowlists)
- The approval card UI needs a "why" field from the orchestrator (Alik's reasoning)
- The Activity view (currently a checklist item in Phase 3) is now a product-critical surface
- Onboarding flow needs a trust-level selection screen
- Settings page needs a trust management section (view/edit/reset)
