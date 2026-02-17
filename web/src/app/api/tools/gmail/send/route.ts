import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/http/origin";
import {
  isValidEmailAddress,
  sendGmailMessageForUser,
} from "@/lib/tools/gmail";

export const runtime = "nodejs";

type SendGmailBody = {
  to?: string;
  subject?: string;
  bodyText?: string;
};

export async function POST(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as SendGmailBody | null;
  const to = body?.to?.trim();
  const subject = body?.subject?.trim();
  const bodyText = body?.bodyText?.trim();

  if (!to || !subject || !bodyText) {
    return NextResponse.json(
      { error: "to, subject, and bodyText are required." },
      { status: 400 },
    );
  }

  if (!isValidEmailAddress(to)) {
    return NextResponse.json(
      { error: "to must be a valid email address." },
      { status: 400 },
    );
  }

  try {
    const sendResult = await sendGmailMessageForUser({
      uid: user.uid,
      origin,
      to,
      subject,
      bodyText,
      auditType: "gmail_send_direct",
      auditMeta: {
        source: "manual_direct_endpoint",
      },
    });

    return NextResponse.json({
      ok: true,
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Gmail send failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
