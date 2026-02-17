import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/http/origin";
import {
  isRecipientAlwaysAllowed,
  isValidEmailAddress,
  normalizeEmailAddress,
  sendGmailMessageForUser,
} from "@/lib/tools/gmail";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type RequestApprovalBody = {
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

  const body = (await request.json().catch(() => null)) as
    | RequestApprovalBody
    | null;
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

  const normalizedTo = normalizeEmailAddress(to);
  const alwaysAllowed = await isRecipientAlwaysAllowed({
    uid: user.uid,
    email: normalizedTo,
  });

  if (alwaysAllowed) {
    try {
      const sendResult = await sendGmailMessageForUser({
        uid: user.uid,
        origin,
        to: normalizedTo,
        subject,
        bodyText,
        auditType: "gmail_send_auto_allowed",
        auditMeta: {
          source: "gmail_approval_request",
          policy: "always_allow_recipient",
        },
      });

      return NextResponse.json({
        ok: true,
        mode: "auto_allowed",
        messageId: sendResult.messageId,
        threadId: sendResult.threadId,
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Gmail send failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const approvalRef = getFirebaseAdminDb()
    .collection("users")
    .doc(user.uid)
    .collection("gmailSendApprovals")
    .doc();

  await approvalRef.set({
    type: "gmail_send",
    status: "pending",
    to: normalizedTo,
    subject,
    bodyText,
    feedback: null,
    decision: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    resolvedAt: null,
    source: "dashboard_manual",
  });

  return NextResponse.json({
    ok: true,
    mode: "requires_approval",
    approval: {
      id: approvalRef.id,
      to: normalizedTo,
      subject,
      bodyPreview: bodyText.length > 220 ? `${bodyText.slice(0, 220)}...` : bodyText,
    },
  });
}
