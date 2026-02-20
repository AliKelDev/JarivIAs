import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { sendGmailDraftForUser } from "@/lib/tools/gmail";
import { getRequestOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = getRequestOrigin(request);

  let draftId: string;
  try {
    const body = await request.json();
    if (!body || typeof body.draftId !== "string") {
      throw new Error("Missing draftId string.");
    }
    draftId = body.draftId;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body or missing draftId" },
      { status: 400 },
    );
  }

  try {
    const result = await sendGmailDraftForUser({
      uid: user.uid,
      origin,
      draftId,
      auditType: "gmail_draft_send",
      auditMeta: { source: "dashboard_portal" },
    });

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Failed to send Gmail draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
