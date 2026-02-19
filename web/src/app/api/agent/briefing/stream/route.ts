import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { runAgent } from "@/lib/agent/orchestrator";
import { listUpcomingCalendarEventsForUser } from "@/lib/tools/calendar";
import { listRecentGmailMessagesForUser } from "@/lib/tools/gmail";
import { getRequestOrigin } from "@/lib/http/origin";
import type { AgentAttachedContextItem } from "@/lib/agent/types";

export const runtime = "nodejs";

const BRIEFING_PROMPT =
  "Give me my morning briefing. What's on my calendar today and tomorrow? " +
  "Any important emails I should know about? " +
  "Suggest 1–2 clear priorities for today. Keep it warm and concise.";

type StreamEvent =
  | { type: "status"; status: string; threadId: string }
  | { type: "delta"; delta: string }
  | { type: "result"; result: Record<string, unknown> }
  | { type: "error"; error: string };

function encodeEvent(encoder: TextEncoder, event: StreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { threadId?: string }
    | null;
  const threadId = body?.threadId?.trim() || randomUUID();

  const [eventsResult, messagesResult] = await Promise.allSettled([
    listUpcomingCalendarEventsForUser({ uid: user.uid, origin, maxResults: 8 }),
    listRecentGmailMessagesForUser({ uid: user.uid, origin, maxResults: 8 }),
  ]);

  const attachedContext: AgentAttachedContextItem[] = [];

  if (eventsResult.status === "fulfilled") {
    for (const event of eventsResult.value.slice(0, 8)) {
      attachedContext.push({
        type: "calendar_event",
        id: event.id ?? `event-${event.startIso ?? "unknown"}`,
        title: event.summary,
        snippet: event.description ?? undefined,
        meta: {
          startIso: event.startIso,
          endIso: event.endIso,
          location: event.location,
        },
      });
    }
  }

  if (messagesResult.status === "fulfilled") {
    for (const msg of messagesResult.value.slice(0, 8)) {
      attachedContext.push({
        type: "email",
        id: msg.id,
        title: msg.subject,
        snippet: msg.snippet,
        meta: { from: msg.from, internalDateIso: msg.internalDateIso },
      });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: StreamEvent) => {
        controller.enqueue(encodeEvent(encoder, event));
      };

      try {
        push({ type: "status", status: "planning", threadId });

        const result = await runAgent({
          uid: user.uid,
          userEmail: user.email ?? null,
          prompt: BRIEFING_PROMPT,
          threadId,
          origin,
          source: "briefing",
          attachedContext: attachedContext.length > 0 ? attachedContext : undefined,
          onTextDelta: async (delta) => {
            if (!delta || delta.length === 0) {
              return;
            }
            push({ type: "delta", delta });
          },
        });

        push({
          type: "result",
          result: result as unknown as Record<string, unknown>,
        });
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Briefing run failed.";
        push({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
