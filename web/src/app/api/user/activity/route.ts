import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function readTimestamp(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit") ?? "20";
  const parsed = Number.parseInt(limitParam, 10);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 20;

  const snapshot = await getFirebaseAdminDb()
    .collection("runs")
    .where("uid", "==", user.uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const runs = snapshot.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      status: typeof d.status === "string" ? d.status : "unknown",
      summary: typeof d.summary === "string" ? d.summary : null,
      prompt: typeof d.prompt === "string" ? d.prompt : null,
      tool: typeof d.pendingTool === "string" ? d.pendingTool : null,
      model: typeof d.model === "string" ? d.model : null,
      threadId: typeof d.threadId === "string" ? d.threadId : null,
      createdAt: readTimestamp(d.createdAt),
    };
  });

  return NextResponse.json({ ok: true, runs });
}
