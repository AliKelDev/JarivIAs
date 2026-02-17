import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getAgentToolSet } from "@/lib/agent/tool-registry";
import type { AgentApprovalDecision, AgentToolArgs } from "@/lib/agent/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { getRequestOrigin } from "@/lib/http/origin";
import { setRecipientAlwaysAllowed } from "@/lib/tools/gmail";

export const runtime = "nodejs";

type ResolveApprovalBody = {
  approvalId?: string;
  decision?: AgentApprovalDecision;
  feedback?: string;
};

type StoredAgentApproval = {
  status?: string;
  tool?: string;
  toolArgs?: AgentToolArgs;
  reason?: string;
  prompt?: string;
  runId?: string;
  actionId?: string;
  threadId?: string;
};

function isValidDecision(value: string): value is AgentApprovalDecision {
  return (
    value === "reject" ||
    value === "approve_once" ||
    value === "approve_and_always_allow_recipient"
  );
}

function readToolArgs(value: unknown): AgentToolArgs {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as AgentToolArgs;
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

  const db = getFirebaseAdminDb();
  const now = FieldValue.serverTimestamp();
  const approvalRef = db
    .collection("users")
    .doc(user.uid)
    .collection("agentApprovals")
    .doc(approvalId);
  const approvalSnapshot = await approvalRef.get();

  if (!approvalSnapshot.exists) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }

  const approval = approvalSnapshot.data() as StoredAgentApproval;
  if (approval.status !== "pending") {
    return NextResponse.json(
      { error: "Approval is no longer pending." },
      { status: 409 },
    );
  }

  const toolName = approval.tool?.trim();
  const runId = approval.runId?.trim();
  const actionId = approval.actionId?.trim();
  const threadId = approval.threadId?.trim() || "";
  const prompt = approval.prompt?.trim() || "";
  const reason = approval.reason?.trim() || "";
  const toolArgs = readToolArgs(approval.toolArgs);

  if (!toolName || !runId || !actionId) {
    return NextResponse.json(
      { error: "Stored approval payload is incomplete." },
      { status: 500 },
    );
  }

  const runRef = db.collection("runs").doc(runId);
  const actionRef = runRef.collection("actions").doc(actionId);

  const toolSet = getAgentToolSet();
  const tool = toolSet.byName.get(toolName);
  if (!tool) {
    return NextResponse.json(
      { error: `Unsupported tool in approval: ${toolName}` },
      { status: 500 },
    );
  }

  if (decision === "reject") {
    await approvalRef.set(
      {
        status: "rejected",
        decision,
        feedback,
        resolvedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    await actionRef.set(
      {
        status: "rejected",
        confirmation: "rejected",
        feedback,
        resolvedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    const summary = `Approval rejected for ${toolName}.`;
    await runRef.set(
      {
        status: "failed",
        summary,
        endedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    await db.collection("audit").add({
      uid: user.uid,
      type: "agent_tool_approval_rejected",
      status: "completed",
      runId,
      actionId,
      approvalId,
      tool: toolName,
      reason,
      feedback,
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      status: "rejected",
      approvalId,
      runId,
      actionId,
      tool: toolName,
    });
  }

  const validatedArgs = tool.validateArgs(toolArgs);
  if (!validatedArgs.ok) {
    return NextResponse.json(
      { error: `Tool args are no longer valid: ${validatedArgs.error}` },
      { status: 400 },
    );
  }

  if (
    decision === "approve_and_always_allow_recipient" &&
    toolName === "gmail_send"
  ) {
    const toValue = validatedArgs.value.to;
    if (typeof toValue === "string") {
      await setRecipientAlwaysAllowed({ uid: user.uid, email: toValue });
    }
  }

  await approvalRef.set(
    {
      status: "executing",
      decision,
      feedback,
      startedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await actionRef.set(
    {
      status: "executing",
      confirmation: "approved",
      decision,
      feedback,
      startedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  try {
    const output = await tool.execute(
      {
        uid: user.uid,
        userEmail: user.email ?? null,
        origin,
        runId,
        actionId,
        threadId,
      },
      validatedArgs.value,
    );

    await approvalRef.set(
      {
        status: "approved_executed",
        output,
        resolvedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    await actionRef.set(
      {
        status: "completed",
        confirmation: "approved",
        output,
        completedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    const summary = `Approved and executed ${toolName}.`;
    await runRef.set(
      {
        status: "completed",
        summary,
        endedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    await db.collection("audit").add({
      uid: user.uid,
      type: "agent_tool_approval_executed",
      status: "completed",
      runId,
      actionId,
      approvalId,
      tool: toolName,
      decision,
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      status: "approved_executed",
      approvalId,
      runId,
      actionId,
      tool: toolName,
      output,
      prompt,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : `Tool execution failed for ${toolName}.`;

    await approvalRef.set(
      {
        status: "failed",
        error: message,
        resolvedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    await actionRef.set(
      {
        status: "failed",
        confirmation: "approved",
        error: message,
        failedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    await runRef.set(
      {
        status: "failed",
        summary: message,
        endedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
