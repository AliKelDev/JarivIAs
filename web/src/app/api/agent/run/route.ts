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

  const result = await runAgent({
    uid: user.uid,
    userEmail: user.email ?? null,
    prompt,
    threadId,
    origin,
    source: "dashboard",
    conversation,
    attachedContext,
  });

  return NextResponse.json(result);
}
