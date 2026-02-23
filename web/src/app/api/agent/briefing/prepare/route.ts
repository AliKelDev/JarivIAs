import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { getRequestOrigin } from "@/lib/http/origin";
import { getUserProfile } from "@/lib/memory";
import { generateGeminiText } from "@/lib/agent/gemini-client";
import { listUpcomingCalendarEventsForUser } from "@/lib/tools/calendar";
import { listRecentGmailMessagesForUser } from "@/lib/tools/gmail";

export const runtime = "nodejs";

const BRIEFING_SYSTEM_INSTRUCTION = `
You are Alik, an executive AI chief of staff.
Write a concise, warm morning briefing in markdown.
Prioritize clarity and actionability over verbosity.
If context is missing, say so briefly and still provide useful priorities.
`.trim();

function normalizeTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "UTC";
  }
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function dateKeyForTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function buildBriefingPrompt(params: {
  timezone: string;
  dateKey: string;
  events: Array<{
    summary: string;
    startIso: string | null;
    endIso: string | null;
    location: string | null;
    description: string | null;
  }>;
  messages: Array<{
    from: string;
    subject: string;
    snippet: string;
    internalDateIso: string | null;
  }>;
}): string {
  const { timezone, dateKey, events, messages } = params;

  const eventLines =
    events.length > 0
      ? events
          .map(
            (event) =>
              `- ${truncate(event.summary, 120)} | start: ${
                event.startIso ?? "unknown"
              } | end: ${event.endIso ?? "unknown"} | location: ${
                event.location ?? "none"
              }`,
          )
          .join("\n")
      : "- No calendar events found.";

  const messageLines =
    messages.length > 0
      ? messages
          .map(
            (message) =>
              `- From: ${truncate(message.from || "Unknown sender", 120)} | Subject: ${truncate(
                message.subject || "(No subject)",
                140,
              )} | Snippet: ${truncate(message.snippet || "", 180)}`,
          )
          .join("\n")
      : "- No inbox messages found.";

  return [
    "Generate a morning briefing from the context below.",
    "Required output format:",
    "- Calendar snapshot",
    "- Important inbox signals",
    "- 1-2 clear priorities for today",
    "",
    `Timezone: ${timezone}`,
    `Date key: ${dateKey}`,
    "",
    `Upcoming calendar events (${events.length}):`,
    eventLines,
    "",
    `Recent inbox messages (${messages.length}):`,
    messageLines,
    "",
    "Keep it warm, concise, and actionable.",
  ].join("\n");
}

function fallbackBriefing(params: {
  timezone: string;
  dateKey: string;
  eventCount: number;
  messageCount: number;
}): string {
  const { timezone, dateKey, eventCount, messageCount } = params;
  return [
    `Morning briefing (${dateKey}, ${timezone}):`,
    `- Calendar: ${eventCount} upcoming event${eventCount === 1 ? "" : "s"}.`,
    `- Inbox: ${messageCount} recent message${messageCount === 1 ? "" : "s"} checked.`,
    "- Priorities: start with time-sensitive replies, then lock your top meeting outcomes.",
  ].join("\n");
}

type StoredBriefing = {
  summary?: unknown;
  timezone?: unknown;
  dateKey?: unknown;
  source?: unknown;
  generatedAtIso?: unknown;
  eventCount?: unknown;
  messageCount?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function briefingDocRef(params: { uid: string; dateKey: string }) {
  const { uid, dateKey } = params;
  return getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("briefings")
    .doc("daily")
    .collection("entries")
    .doc(dateKey);
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = getRequestOrigin(request);
  const profile = await getUserProfile(user.uid);
  const timezone = normalizeTimeZone(profile?.timezone);
  const dateKey = dateKeyForTimeZone(timezone);
  const ref = briefingDocRef({ uid: user.uid, dateKey });

  try {
    const existingSnapshot = await ref.get();
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() as StoredBriefing;
      if (isNonEmptyString(existing.summary)) {
        return NextResponse.json({
          ok: true,
          cached: true,
          summary: existing.summary.trim(),
          dateKey,
          timezone:
            typeof existing.timezone === "string" ? existing.timezone : timezone,
          source: typeof existing.source === "string" ? existing.source : "on_login",
          generatedAtIso:
            typeof existing.generatedAtIso === "string"
              ? existing.generatedAtIso
              : null,
          metadata: {
            eventCount: readNumber(existing.eventCount) ?? 0,
            messageCount: readNumber(existing.messageCount) ?? 0,
          },
        });
      }
    }

    const [eventsResult, messagesResult] = await Promise.allSettled([
      listUpcomingCalendarEventsForUser({ uid: user.uid, origin, maxResults: 8 }),
      listRecentGmailMessagesForUser({ uid: user.uid, origin, maxResults: 8 }),
    ]);

    const events =
      eventsResult.status === "fulfilled" ? eventsResult.value.slice(0, 8) : [];
    const messages =
      messagesResult.status === "fulfilled" ? messagesResult.value.slice(0, 8) : [];

    const prompt = buildBriefingPrompt({
      timezone,
      dateKey,
      events,
      messages,
    });

    const generated = await generateGeminiText({
      prompt,
      systemInstruction: BRIEFING_SYSTEM_INSTRUCTION,
    });

    const summary = generated.trim()
      ? generated.trim()
      : fallbackBriefing({
          timezone,
          dateKey,
          eventCount: events.length,
          messageCount: messages.length,
        });

    const generatedAtIso = new Date().toISOString();
    await ref.set(
      {
        summary,
        dateKey,
        timezone,
        source: "on_login",
        eventCount: events.length,
        messageCount: messages.length,
        generatedAtIso,
        generatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      cached: false,
      summary,
      dateKey,
      timezone,
      source: "on_login",
      generatedAtIso,
      metadata: {
        eventCount: events.length,
        messageCount: messages.length,
      },
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Briefing preparation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
