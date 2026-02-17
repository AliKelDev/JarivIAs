import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/http/origin";
import {
  sendGmailMessageForUser,
  setRecipientAlwaysAllowed,
} from "@/lib/tools/gmail";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type ResolveDecision =
  | "reject"
  | "approve_once"
  | "approve_and_always_allow_recipient";

type ResolveApprovalBody = {
  approvalId?: string;
  decision?: ResolveDecision;
  feedback?: string;
};

type PendingApproval = {
  status?: string;
  to?: string;
  subject?: string;
  bodyText?: string;
};

function isValidDecision(value: string): value is ResolveDecision {
  return (
    value === "reject" ||
    value === "approve_once" ||
    value === "approve_and_always_allow_recipient"
  );
}

export async function POST(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | ResolveApprovalBody
    | null;
  const approvalId = body?.approvalId?.trim();
  const decision = body?.decision?.trim();
  const feedback = body?.feedback?.trim() || null;

  if (!approvalId || !decision || !isValidDecision(decision)) {
    return NextResponse.json(
      { error: "approvalId and a valid decision are required." },
      { status: 400 },
    );
  }

  const approvalRef = getFirebaseAdminDb()
    .collection("users")
    .doc(user.uid)
    .collection("gmailSendApprovals")
    .doc(approvalId);

  const approvalSnapshot = await approvalRef.get();
  if (!approvalSnapshot.exists) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }

  const approval = approvalSnapshot.data() as PendingApproval;
  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: "Approval is no longer pending." },
      { status: 409 },
    );
  }

  const to = approval.to?.trim();
  const subject = approval.subject?.trim();
  const bodyText = approval.bodyText?.trim();
  if (!to || !subject || !bodyText) {
    return NextResponse.json(
      { error: "Stored approval payload is incomplete." },
      { status: 500 },
    );
  }

  if (decision === "reject") {
    await approvalRef.set(
      {
        status: "rejected",
        decision,
        feedback,
        resolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await getFirebaseAdminDb().collection("audit").add({
      uid: user.uid,
      type: "gmail_send_approval_rejected",
      status: "completed",
      approvalId,
      to,
      subject,
      feedback,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      status: "rejected",
      approvalId,
    });
  }

  try {
    if (decision === "approve_and_always_allow_recipient") {
      await setRecipientAlwaysAllowed({ uid: user.uid, email: to });
    }

    const sendResult = await sendGmailMessageForUser({
      uid: user.uid,
      origin,
      to,
      subject,
      bodyText,
      auditType: "gmail_send_approved",
      auditMeta: {
        source: "gmail_approval_resolve",
        approvalId,
        decision,
      },
    });

    await approvalRef.set(
      {
        status: "approved_sent",
        decision,
        feedback,
        messageId: sendResult.messageId,
        threadId: sendResult.threadId,
        resolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      status: "approved_sent",
      approvalId,
      decision,
      messageId: sendResult.messageId,
      threadId: sendResult.threadId,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Gmail send failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
