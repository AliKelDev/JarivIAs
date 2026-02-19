# Memory & User Profile System

Author: Claude (Sonnet 4.6)
Last updated: 2026-02-19

---

## 1. Purpose

Alik currently has no persistent knowledge of the user between sessions. Every conversation starts
cold. For Alik to feel like an employee who knows you — not a stateless chatbot — she needs a
growing understanding of:

- Who you are (name, role, company, timezone)
- What you care about (interests, priorities, ongoing projects)
- Who matters to you (key contacts and their relationship to you)
- How you like to work (tone preferences, communication style, approval habits)

This doc specifies the data model, ingestion strategy, and injection mechanism for that memory.

---

## 2. Two Layers of Memory

### Layer 1: Explicit User Profile

User-authored. Set up during onboarding or edited at any time via a settings page.

Fields:

```ts
type UserProfile = {
  displayName: string;
  role?: string;              // e.g. "Founder", "Engineer", "Student"
  organization?: string;
  timezone: string;           // IANA tz string, e.g. "America/Toronto"
  language?: string;          // e.g. "en", "fr"
  preferredTone?: "formal" | "casual" | "concise";
  interests?: string[];       // Free-text tags, e.g. ["startups", "AI", "music"]
  ongoingProjects?: string[]; // Free-text summaries, e.g. ["building JarivIAs, an agentic portal"]
  importantContacts?: ImportantContact[];
  notes?: string;             // Freeform "anything else Alik should know"
};

type ImportantContact = {
  name: string;
  email?: string;
  relationship: string;       // e.g. "business partner", "professor", "investor"
};
```

Stored in Firestore: `users/{uid}/profile` (single document).

### Layer 2: Implicit Conversational Memory

System-generated. Extracted from interactions over time.

Stored as a list of memory entries:

```ts
type MemoryEntry = {
  id: string;
  createdAt: Timestamp;
  source: "conversation" | "action" | "system";
  threadId?: string;
  content: string;            // Plain-text fact, e.g. "User prefers not to be cc'd on replies"
  tags?: string[];
  confidence: "high" | "medium";
};
```

Stored in Firestore: `users/{uid}/memory` (collection, one document per entry).

---

## 3. How Implicit Memory Gets Written

Two mechanisms:

**A. Post-run extraction (async)**
After a completed run, a lightweight Gemini call scans the conversation turn and asks:
"Did anything in this exchange reveal a preference, fact, or pattern worth remembering?"
If yes, it writes one or two `MemoryEntry` documents. If no, nothing is written.

This call is fire-and-forget and does not block the main run response.

**B. Explicit user signal**
User can say "remember that..." in chat. The orchestrator recognizes this intent (via Gemini)
and writes a memory entry directly, then confirms it in the response.

---

## 4. Context Injection at Runtime

When a run starts, the orchestrator fetches:
1. The full `UserProfile` document
2. The most recent N memory entries (N = 20 by default, sorted by `createdAt` desc)

These are serialized into the system prompt as a `[ABOUT THE USER]` block, before Alik's persona
instructions. Example:

```
[ABOUT THE USER]
Name: Alex
Role: Founder
Building: JarivIAs, an agentic AI portal
Timezone: America/Toronto
Interests: AI, startups
Important contacts:
  - Sarah Chen (business partner, sarah@example.com)
Recent memory:
  - Prefers direct, concise replies
  - Usually active between 9am and midnight
  - Does not want calendar events created on weekends without asking
```

Token budget for this block: ~500 tokens. Truncate older memory entries first if over budget.

---

## 5. Thread Summary on Launch

When the dashboard loads (or a new session starts), a summary of recent activity is optionally
surfaced. This is a read path only — no new run is triggered.

Mechanism:
- Fetch the last 3 threads from Firestore
- Summarize them with a single Gemini call: "In 2-3 sentences, what has Alik helped with recently?"
- Display as a soft greeting in the UI: "Welcome back. Last time we drafted a reply to Sarah and
  scheduled your Thursday sync."

This creates the illusion of continuity without being intrusive.

---

## 6. Profile Setup UX

A lightweight onboarding flow triggered on first login (or accessible via Settings):

1. "What should Alik call you?" (name)
2. "What do you do?" (role, org — optional)
3. "What's your timezone?" (auto-detected, confirmable)
4. "Anything Alik should always know about you?" (freeform notes)
5. "Any important people in your life?" (contacts — optional, skippable)

This should feel like telling a new assistant about yourself, not filling out a form.

---

## 7. Memory Management

Users can view and delete memory entries from a Settings > Memory page.

- Display as a list of plain-text facts with timestamps
- Allow individual deletion
- Allow full wipe ("forget everything")

No memory entry should be surfaced to the user as a raw database object — always plain language.

---

## 8. Privacy Considerations

- Memory entries stay in Firestore, scoped per UID, never shared
- Implicit memory extraction is opt-in (default on, but toggleable in settings)
- No memory content is logged to the audit trail (it's not an action, it's state)
- If user deletes their account, all profile + memory documents are purged

---

## 9. Firestore Structure

| Path | Type | Description |
|---|---|---|
| `users/{uid}` | Document | User document; profile stored as a `profile` map field |
| `users/{uid}/memory/{entryId}` | Collection | One document per MemoryEntry |

Profile is stored as a nested map field on the user document (`users/{uid}.profile`), not a
subcollection. This keeps it in a single read and avoids an extra collection for a single object.

Indexes needed:
- `users/{uid}/memory` ordered by `createdAt` desc

---

## 10. Non-Goals (V1)

- Cross-user memory (Alik does not share learnings between users)
- Memory confidence scoring via ML
- Automatic memory decay or expiry
- Semantic search over memory (plain recency ordering is sufficient for V1)
