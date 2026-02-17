import { FieldValue } from "firebase-admin/firestore";
import { getGeminiModelName, generateGeminiAgentPlan } from "@/lib/agent/gemini-client";
import { evaluateAgentToolPolicy } from "@/lib/agent/policy";
import { getAgentToolSet } from "@/lib/agent/tool-registry";
import {
  appendThreadMessage,
  ensureThreadForUser,
  listThreadConversationForModel,
} from "@/lib/agent/thread";
import type {
  AgentRunRequest,
  AgentRunResponse,
  AgentToolArgs,
  AgentToolDefinition,
} from "@/lib/agent/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

const AGENT_SYSTEM_INSTRUCTION = `
You are Jariv's execution assistant inside an authenticated portal.
Rules:
- If a user asks for an action that maps to an available tool, call the tool.
- If the user asks for general guidance, answer in plain text.
- Never invent tool names or arguments.
- Keep responses concise and operational.
`.trim();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFunctionCallArgs(value: unknown): AgentToolArgs {
  if (!isRecord(value)) {
    return {};
  }
  return value;
}

async function markRunFailed(params: {
  runRefPath: string;
  actionRefPath?: string;
  message: string;
}) {
  const { runRefPath, actionRefPath, message } = params;
  const db = getFirebaseAdminDb();
  const runRef = db.doc(runRefPath);
  const now = FieldValue.serverTimestamp();

  await runRef.set(
    {
      status: "failed",
      summary: message,
      endedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  if (actionRefPath) {
    await db.doc(actionRefPath).set(
      {
        status: "failed",
        error: message,
        failedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }
}

function buildToolNotFoundMessage(toolName: string): string {
  return `Model requested unsupported tool "${toolName}".`;
}

async function persistAssistantThreadMessage(params: {
  uid: string;
  threadId: string;
  text: string;
  runId: string;
  actionId: string;
}) {
  const { uid, threadId, text, runId, actionId } = params;
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  await appendThreadMessage({
    uid,
    threadId,
    role: "assistant",
    text: trimmed,
    runId,
    actionId,
  });
}

async function persistPendingApproval(params: {
  uid: string;
  runId: string;
  actionId: string;
  threadId: string;
  prompt: string;
  tool: AgentToolDefinition;
  toolArgs: AgentToolArgs;
  reason: string;
  model: string;
  source: string;
}) {
  const {
    uid,
    runId,
    actionId,
    threadId,
    prompt,
    tool,
    toolArgs,
    reason,
    model,
    source,
  } = params;

  const db = getFirebaseAdminDb();
  const now = FieldValue.serverTimestamp();
  const approvalRef = db
    .collection("users")
    .doc(uid)
    .collection("agentApprovals")
    .doc();

  const preview = tool.previewForApproval(toolArgs);

  await approvalRef.set({
    status: "pending",
    tool: tool.name,
    toolArgs,
    reason,
    preview,
    runId,
    actionId,
    threadId,
    prompt,
    model,
    source,
    decision: null,
    feedback: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  });

  await db.collection("audit").add({
    uid,
    type: "agent_tool_approval_requested",
    status: "completed",
    runId,
    actionId,
    approvalId: approvalRef.id,
    tool: tool.name,
    reason,
    createdAt: now,
  });

  return { approvalId: approvalRef.id, preview };
}

export async function runAgent(request: AgentRunRequest): Promise<AgentRunResponse> {
  const db = getFirebaseAdminDb();
  const runRef = db.collection("runs").doc();
  const actionRef = runRef.collection("actions").doc();
  const now = FieldValue.serverTimestamp();

  await runRef.set({
    threadId: request.threadId,
    uid: request.uid,
    userEmail: request.userEmail,
    prompt: request.prompt,
    status: "planning",
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    source: request.source,
  });

  const runRefPath = runRef.path;
  const actionRefPath = actionRef.path;

  const toolSet = getAgentToolSet();
  const modelName = getGeminiModelName();

  try {
    await ensureThreadForUser({
      uid: request.uid,
      threadId: request.threadId,
      source: request.source,
    });

    await appendThreadMessage({
      uid: request.uid,
      threadId: request.threadId,
      role: "user",
      text: request.prompt,
      runId: runRef.id,
      actionId: actionRef.id,
    });

    const conversation = await listThreadConversationForModel({
      uid: request.uid,
      threadId: request.threadId,
      limit: 30,
    });

    const plan = await generateGeminiAgentPlan({
      conversation,
      toolDeclarations: toolSet.declarations,
      systemInstruction: AGENT_SYSTEM_INSTRUCTION,
    });

    const firstFunctionCall = plan.functionCalls[0];

    if (!firstFunctionCall?.name) {
      const text =
        plan.text.trim() ||
        "Gemini completed without tool calls and returned no text output.";

      await actionRef.set({
        uid: request.uid,
        type: "assistant_response",
        status: "completed",
        confirmation: "not_required",
        tool: null,
        input: { prompt: request.prompt },
        output: {
          text,
        },
        model: plan.model,
        usage: plan.usage,
        createdAt: now,
        completedAt: now,
        updatedAt: now,
      });

      await runRef.set(
        {
          status: "completed",
          summary: text,
          model: plan.model,
          endedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text,
        runId: runRef.id,
        actionId: actionRef.id,
      });

      return {
        ok: true,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        status: "completed",
        summary: text,
        mode: "assistant_text",
        model: plan.model,
      };
    }

    const tool = toolSet.byName.get(firstFunctionCall.name);
    if (!tool) {
      const message = buildToolNotFoundMessage(firstFunctionCall.name);
      await actionRef.set({
        uid: request.uid,
        type: "tool_call",
        tool: firstFunctionCall.name,
        status: "failed",
        confirmation: "not_required",
        input: { prompt: request.prompt, functionCall: firstFunctionCall },
        error: message,
        model: plan.model,
        createdAt: now,
        failedAt: now,
        updatedAt: now,
      });

      await markRunFailed({
        runRefPath,
        actionRefPath,
        message,
      });

      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: message,
        runId: runRef.id,
        actionId: actionRef.id,
      });

      return {
        ok: true,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        status: "failed",
        summary: message,
        mode: "assistant_text",
        model: plan.model,
      };
    }

    const validatedArgs = tool.validateArgs(readFunctionCallArgs(firstFunctionCall.args));
    if (!validatedArgs.ok) {
      const message = `Tool argument validation failed for ${tool.name}: ${validatedArgs.error}`;
      await actionRef.set({
        uid: request.uid,
        type: "tool_call",
        tool: tool.name,
        status: "failed",
        confirmation: "not_required",
        input: {
          prompt: request.prompt,
          functionCall: firstFunctionCall,
        },
        error: message,
        model: plan.model,
        createdAt: now,
        failedAt: now,
        updatedAt: now,
      });

      await markRunFailed({
        runRefPath,
        actionRefPath,
        message,
      });

      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: message,
        runId: runRef.id,
        actionId: actionRef.id,
      });

      return {
        ok: true,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        status: "failed",
        summary: message,
        mode: "assistant_text",
        model: plan.model,
        tool: tool.name,
      };
    }

    const toolArgs = validatedArgs.value;
    const policy = await evaluateAgentToolPolicy({
      uid: request.uid,
      tool,
      args: toolArgs,
    });

    if (policy.mode === "deny") {
      const message = `Policy denied ${tool.name}: ${policy.reason}`;

      await actionRef.set({
        uid: request.uid,
        type: "tool_call",
        tool: tool.name,
        status: "failed",
        confirmation: "denied",
        input: {
          prompt: request.prompt,
          args: toolArgs,
        },
        policy,
        error: message,
        model: plan.model,
        createdAt: now,
        failedAt: now,
        updatedAt: now,
      });

      await db.collection("audit").add({
        uid: request.uid,
        type: "agent_tool_policy_denied",
        status: "completed",
        runId: runRef.id,
        actionId: actionRef.id,
        tool: tool.name,
        reason: policy.reason,
        createdAt: now,
      });

      await markRunFailed({
        runRefPath,
        actionRefPath,
        message,
      });

      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: message,
        runId: runRef.id,
        actionId: actionRef.id,
      });

      return {
        ok: true,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        status: "failed",
        summary: message,
        mode: "assistant_text",
        model: plan.model,
        tool: tool.name,
      };
    }

    if (policy.mode === "require_approval") {
      const pendingApproval = await persistPendingApproval({
        uid: request.uid,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        prompt: request.prompt,
        tool,
        toolArgs,
        reason: policy.reason,
        model: plan.model,
        source: request.source,
      });

      await actionRef.set({
        uid: request.uid,
        type: "tool_call",
        tool: tool.name,
        status: "awaiting_confirmation",
        confirmation: "required",
        approvalId: pendingApproval.approvalId,
        input: {
          prompt: request.prompt,
          args: toolArgs,
        },
        policy,
        model: plan.model,
        createdAt: now,
        updatedAt: now,
      });

      const summary = `${tool.name} is awaiting approval: ${policy.reason}`;
      const assistantApprovalPrompt = [
        `I can run this action, but I need your approval first.`,
        `Tool: ${tool.name}.`,
        `Plan: ${pendingApproval.preview}`,
      ].join(" ");
      await runRef.set(
        {
          status: "awaiting_confirmation",
          summary,
          model: plan.model,
          pendingApprovalId: pendingApproval.approvalId,
          pendingTool: tool.name,
          updatedAt: now,
        },
        { merge: true },
      );

      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: assistantApprovalPrompt,
        runId: runRef.id,
        actionId: actionRef.id,
      });

      return {
        ok: true,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        status: "awaiting_confirmation",
        summary,
        mode: "requires_approval",
        model: plan.model,
        tool: tool.name,
        toolArgs,
        approval: {
          id: pendingApproval.approvalId,
          tool: tool.name,
          reason: policy.reason,
          preview: pendingApproval.preview,
        },
      };
    }

    await actionRef.set({
      uid: request.uid,
      type: "tool_call",
      tool: tool.name,
      status: "executing",
      confirmation: "not_required",
      input: {
        prompt: request.prompt,
        args: toolArgs,
      },
      policy,
      model: plan.model,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
    });

    try {
      const output = await tool.execute(
        {
          uid: request.uid,
          userEmail: request.userEmail,
          origin: request.origin,
          runId: runRef.id,
          actionId: actionRef.id,
          threadId: request.threadId,
        },
        toolArgs,
      );

      await actionRef.set(
        {
          status: "completed",
          output,
          completedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      const summary =
        plan.text.trim() || `Executed ${tool.name} successfully.`;
      await runRef.set(
        {
          status: "completed",
          summary,
          model: plan.model,
          endedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: summary,
        runId: runRef.id,
        actionId: actionRef.id,
      });

      return {
        ok: true,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        status: "completed",
        summary,
        mode: "tool_executed",
        model: plan.model,
        tool: tool.name,
        toolArgs,
        output,
      };
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : `Tool execution failed for ${tool.name}.`;

      await actionRef.set(
        {
          status: "failed",
          error: message,
          failedAt: now,
          updatedAt: now,
        },
        { merge: true },
      );

      await markRunFailed({
        runRefPath,
        actionRefPath,
        message,
      });

      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: message,
        runId: runRef.id,
        actionId: actionRef.id,
      });

      return {
        ok: true,
        runId: runRef.id,
        actionId: actionRef.id,
        threadId: request.threadId,
        status: "failed",
        summary: message,
        mode: "assistant_text",
        model: plan.model,
        tool: tool.name,
        toolArgs,
      };
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Agent planning failed.";

    await actionRef.set({
      uid: request.uid,
      type: "planner",
      tool: null,
      status: "failed",
      confirmation: "not_required",
      input: {
        prompt: request.prompt,
      },
      error: message,
      model: modelName,
      createdAt: now,
      failedAt: now,
      updatedAt: now,
    });

    await markRunFailed({
      runRefPath,
      actionRefPath,
      message,
    });

    try {
      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: message,
        runId: runRef.id,
        actionId: actionRef.id,
      });
    } catch {
      // Ignore secondary chat persistence failures in error path.
    }

    return {
      ok: true,
      runId: runRef.id,
      actionId: actionRef.id,
      threadId: request.threadId,
      status: "failed",
      summary: message,
      mode: "assistant_text",
      model: modelName,
    };
  }
}
