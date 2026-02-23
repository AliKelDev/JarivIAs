# Memory & User Profile System

Author: Claude (Sonnet 4.6), updated by Codex (GPT-5)
Last updated: 2026-02-23

This doc describes the memory system as it is currently implemented.

## 1. Purpose

Make Alik feel continuous across sessions by injecting user profile + recent memory into each run and allowing the agent to save useful long-term facts.

## 2. Data Model

Profile (single map field):
- Path: `users/{uid}.profile`
- Source: onboarding + profile editor APIs

Memory entries:
- Path: `users/{uid}/memory/{entryId}`
- Fields:
  - `source`: `conversation | action | system | explicit`
  - `threadId` (optional)
  - `content` (string)
  - `tags` (optional string[])
  - `confidence`: `high | medium`
  - `createdAt` (timestamp)

## 3. Runtime Context Injection

At run start, the orchestrator calls `buildUserContextBlock(uid)`.

It fetches in parallel:
- `getUserProfile(uid)`
- `getRecentMemoryEntries(uid, 20)`

Injected block format:
- `[ABOUT THE USER]`
- profile lines (name, role, org, timezone, contacts, notes, etc. if present)
- `Things to remember:` list from memory entries
- `[END ABOUT THE USER]`

Failures in this read path are non-fatal; runs continue without memory block.

## 4. How Memory Gets Written (Current)

Memory is now agent-driven, not post-run extraction.

Tool:
- `save_memory`
- Side effect: `false`
- Approval: not required
- Behavior: writes one entry via `addMemoryEntry(uid, ...)`

System instruction explicitly tells Alik when to call `save_memory`:
- preferences
- constraints
- working style
- important contacts
- decisions

Read tool:
- `search_memory`
- Allows the agent to query older memory by text mid-run.

## 5. User Controls

Dashboard provides:
- memory list (`GET /api/user/memory`)
- delete entry (`DELETE /api/user/memory?id=...`)
- profile editor (`GET/POST /api/user/profile`)

## 6. Known Limitations

- No semantic/vector retrieval yet; search is text matching over recent scan window.
- No automatic deduplication policy.
- No memory expiry policy.

## 7. Next Evolution Options

1. Add dedupe scoring before `save_memory` writes.
2. Add semantic retrieval for `search_memory`.
3. Add per-user memory toggles and retention policy controls.

---
Signed by: Codex (GPT-5)
Date: 2026-02-23
