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

const MORNING_REFRESH_HOUR = 8;
const FETCH_MAX_ATTEMPTS = 3;
const FETCH_BASE_DELAY_MS = 250;

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

function dateKeyForTimeZone(timeZone: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function readLocalHourForTimeZone(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hourValue = parts.find((part) => part.type === "hour")?.value ?? "0";
  const parsed = Number.parseInt(hourValue, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function shouldRegenerateAfterMorningCutoff(params: {
  generatedAtIso: string | null;
  timezone: string;
  dateKey: string;
  nowDate: Date;
}): boolean {
  const { generatedAtIso, timezone, dateKey, nowDate } = params;
  const currentHour = readLocalHourForTimeZone(timezone, nowDate);
  if (currentHour < MORNING_REFRESH_HOUR) {
    return false;
  }

  if (!generatedAtIso) {
    return true;
  }

  const generatedAtMs = Date.parse(generatedAtIso);
  if (Number.isNaN(generatedAtMs)) {
    return true;
  }

  const generatedAt = new Date(generatedAtMs);
  const generatedDateKey = dateKeyForTimeZone(timezone, generatedAt);
  if (generatedDateKey !== dateKey) {
    return true;
  }

  const generatedHour = readLocalHourForTimeZone(timezone, generatedAt);
  return generatedHour < MORNING_REFRESH_HOUR;
}

function readErrorStatusCode(caughtError: unknown): number | null {
  if (!caughtError || typeof caughtError !== "object") {
    return null;
  }

  const statusValue =
    "status" in caughtError
      ? (caughtError as { status?: unknown }).status
      : undefined;
  if (typeof statusValue === "number" && Number.isFinite(statusValue)) {
    return statusValue;
  }

  const codeValue =
    "code" in caughtError ? (caughtError as { code?: unknown }).code : undefined;
  if (typeof codeValue === "number" && Number.isFinite(codeValue)) {
    return codeValue;
  }

  return null;
}

function isRetryableFetchError(caughtError: unknown): boolean {
  const statusCode = readErrorStatusCode(caughtError);
  if (
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504
  ) {
    return true;
  }

  const message =
    caughtError instanceof Error ? caughtError.message.toLowerCase() : "";
  if (!message) {
    return false;
  }

  return (
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("econnreset") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("500") ||
    message.includes("429")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (attempt < FETCH_MAX_ATTEMPTS) {
    try {
      return await operation();
    } catch (caughtError) {
      attempt += 1;
      const shouldRetry =
        attempt < FETCH_MAX_ATTEMPTS && isRetryableFetchError(caughtError);
      if (!shouldRetry) {
        throw caughtError;
      }

      const delayMs =
        FETCH_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 75);
      await sleep(delayMs);
    }
  }

  throw new Error("Fetch retry failed.");
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
  const nowDate = new Date();
  const dateKey = dateKeyForTimeZone(timezone, nowDate);
  const ref = briefingDocRef({ uid: user.uid, dateKey });

  try {
    let generationSource = "on_login";
    const existingSnapshot = await ref.get();
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() as StoredBriefing;
      if (isNonEmptyString(existing.summary)) {
        const existingTimezone =
          typeof existing.timezone === "string" ? existing.timezone : timezone;
        const existingGeneratedAtIso =
          typeof existing.generatedAtIso === "string"
            ? existing.generatedAtIso
            : null;

        const shouldRefreshAfterMorningCutoff =
          shouldRegenerateAfterMorningCutoff({
            generatedAtIso: existingGeneratedAtIso,
            timezone: existingTimezone,
            dateKey,
            nowDate,
          });

        if (!shouldRefreshAfterMorningCutoff) {
          return NextResponse.json({
            ok: true,
            cached: true,
            summary: existing.summary.trim(),
            dateKey,
            timezone: existingTimezone,
            source: typeof existing.source === "string" ? existing.source : "on_login",
            generatedAtIso: existingGeneratedAtIso,
            metadata: {
              eventCount: readNumber(existing.eventCount) ?? 0,
              messageCount: readNumber(existing.messageCount) ?? 0,
            },
          });
        }

        generationSource = "on_login_after_8am_refresh";
      }
    }

    const [eventsResult, messagesResult] = await Promise.allSettled([
      withRetry(() =>
        listUpcomingCalendarEventsForUser({ uid: user.uid, origin, maxResults: 8 }),
      ),
      withRetry(() =>
        listRecentGmailMessagesForUser({ uid: user.uid, origin, maxResults: 8 }),
      ),
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
        source: generationSource,
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
      source: generationSource,
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
