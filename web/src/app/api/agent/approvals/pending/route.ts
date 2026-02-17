import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type PendingApprovalResponseItem = {
  id: string;
  tool: string;
  reason: string;
  preview: string;
  runId: string;
  actionId: string;
  threadId: string;
  prompt: string;
  createdAt: string | null;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit") || "10";
  const parsedLimit = Number.parseInt(limitParam, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 25)
    : 10;

  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .doc(user.uid)
    .collection("agentApprovals")
    .where("status", "==", "pending")
    .limit(25)
    .get();

  const pendingUnsorted: PendingApprovalResponseItem[] = snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const createdAtValue = data.createdAt;
    const createdAt =
      createdAtValue &&
      typeof createdAtValue === "object" &&
      "toDate" in createdAtValue &&
      typeof createdAtValue.toDate === "function"
        ? createdAtValue.toDate().toISOString()
        : null;

    return {
      id: doc.id,
      tool: typeof data.tool === "string" ? data.tool : "",
      reason: typeof data.reason === "string" ? data.reason : "",
      preview: typeof data.preview === "string" ? data.preview : "",
      runId: typeof data.runId === "string" ? data.runId : "",
      actionId: typeof data.actionId === "string" ? data.actionId : "",
      threadId: typeof data.threadId === "string" ? data.threadId : "",
      prompt: typeof data.prompt === "string" ? data.prompt : "",
      createdAt,
    };
  });

  const pending = pendingUnsorted
    .sort((a, b) => {
      const aMs = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bMs = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bMs - aMs;
    })
    .slice(0, limit);

  return NextResponse.json({
    ok: true,
    pending,
  });
}
