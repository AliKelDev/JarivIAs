import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type AgentRunRequestBody = {
  prompt?: string;
  threadId?: string;
};

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | AgentRunRequestBody
    | null;
  const prompt = body?.prompt?.trim();
  const threadId = body?.threadId?.trim() || randomUUID();

  if (!prompt) {
    return NextResponse.json(
      { error: "Prompt is required." },
      { status: 400 },
    );
  }

  const db = getFirebaseAdminDb();
  const runRef = db.collection("runs").doc();
  const actionRef = runRef.collection("actions").doc();
  const now = FieldValue.serverTimestamp();

  await runRef.set({
    threadId,
    uid: user.uid,
    userEmail: user.email ?? null,
    prompt,
    status: "completed",
    createdAt: now,
    startedAt: now,
    endedAt: now,
    updatedAt: now,
    source: "dashboard",
  });

  await actionRef.set({
    uid: user.uid,
    type: "tool_call",
    tool: "stub_plan",
    status: "completed",
    confirmation: "not_required",
    createdAt: now,
    completedAt: now,
    input: {
      prompt,
    },
    output: {
      summary:
        "Agent stub run persisted. Replace this with Gemini planning + tools.",
    },
  });

  return NextResponse.json({
    ok: true,
    runId: runRef.id,
    actionId: actionRef.id,
    threadId,
    status: "completed",
    summary:
      "Run recorded. Next step: connect Gemini function-calling and real tool adapters.",
  });
}
