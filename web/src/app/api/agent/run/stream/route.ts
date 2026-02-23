import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import {
  sanitizeAttachedContextInput,
  sanitizeConversationInput,
} from "@/lib/agent/conversation";
import { runAgent } from "@/lib/agent/orchestrator";
import { getRequestOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";

type AgentRunRequestBody = {
  prompt?: string;
  threadId?: string;
  conversation?: unknown;
  attachedContext?: unknown;
};

type StreamEvent =
  | { type: "status"; status: string; threadId: string }
  | { type: "delta"; delta: string }
  | { type: "tool_call"; toolName: string; preview: string }
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
    | AgentRunRequestBody
    | null;
  const prompt = body?.prompt?.trim();
  const threadId = body?.threadId?.trim() || randomUUID();
  const conversation = sanitizeConversationInput(body?.conversation, 40);
  const attachedContext = sanitizeAttachedContextInput(body?.attachedContext, 12);

  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt is required." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: StreamEvent) => {
        controller.enqueue(encodeEvent(encoder, event));
      };

      try {
        push({
          type: "status",
          status: "planning",
          threadId,
        });

        const result = await runAgent({
          uid: user.uid,
          userEmail: user.email ?? null,
          prompt,
          threadId,
          origin,
          source: "dashboard_stream",
          conversation,
          attachedContext,
          onTextDelta: async (delta) => {
            if (!delta || delta.length === 0) return;
            push({ type: "delta", delta });
          },
          onToolCall: async (toolName, preview) => {
            push({ type: "tool_call", toolName, preview });
          },
        });

        push({
          type: "result",
          result: result as unknown as Record<string, unknown>,
        });
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Agent run failed.";
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
