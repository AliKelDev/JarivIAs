import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { listThreadMessages } from "@/lib/agent/thread";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type PendingApprovalItem = {
  id: string;
  tool: string;
  reason: string;
  preview: string;
  runId: string;
  actionId: string;
  createdAt: string | null;
};

function toIso(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    if (date instanceof Date) {
      return date.toISOString();
    }
  }
  return null;
}

async function listPendingApprovalsForThread(params: {
  uid: string;
  threadId: string;
  limit?: number;
}): Promise<PendingApprovalItem[]> {
  const { uid, threadId } = params;
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);

  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("agentApprovals")
    .where("status", "==", "pending")
    .where("threadId", "==", threadId)
    .get();

  const pending = snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      tool: typeof data.tool === "string" ? data.tool : "",
      reason: typeof data.reason === "string" ? data.reason : "",
      preview: typeof data.preview === "string" ? data.preview : "",
      runId: typeof data.runId === "string" ? data.runId : "",
      actionId: typeof data.actionId === "string" ? data.actionId : "",
      createdAt: toIso(data.createdAt),
    };
  });

  return pending
    .sort((a, b) => {
      const aMs = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bMs = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bMs - aMs;
    })
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threadId = request.nextUrl.searchParams.get("threadId")?.trim();
  if (!threadId) {
    return NextResponse.json(
      { error: "threadId query parameter is required." },
      { status: 400 },
    );
  }

  try {
    const [messages, pendingApprovals] = await Promise.all([
      listThreadMessages({
        uid: user.uid,
        threadId,
        limit: 120,
      }),
      listPendingApprovalsForThread({
        uid: user.uid,
        threadId,
        limit: 10,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      threadId,
      messages,
      pendingApprovals,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Thread load failed.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
