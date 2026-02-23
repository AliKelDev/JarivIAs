import { FieldValue } from "firebase-admin/firestore";
import { sanitizeConversationInput } from "@/lib/agent/conversation";
import { getGeminiModelName, generateGeminiAgentPlan } from "@/lib/agent/gemini-client";
import { evaluateAgentToolPolicy } from "@/lib/agent/policy";
import { getAgentToolSet } from "@/lib/agent/tool-registry";
import {
  appendThreadMessage,
  ensureThreadForUser,
  listThreadConversationForModel,
} from "@/lib/agent/thread";
import type {
  AgentAttachedContextItem,
  AgentConversationMessage,
  AgentRunRequest,
  AgentRunResponse,
  AgentToolArgs,
  AgentToolDefinition,
} from "@/lib/agent/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { buildUserContextBlock } from "@/lib/memory";

const AGENT_SYSTEM_INSTRUCTION = `
You are Alik, a capable and upbeat AI teammate inside an authenticated portal.
Your mission is to help humans get meaningful work done.
Style:
- Be natural, warm, and proactive.
- Keep responses concise but not robotic.
- Ask clear follow-up questions only when required details are missing.
Execution:
- If a user asks for an action that maps to an available tool, call the tool.
- If no tool is needed, answer directly in plain text.
- Never invent tool names or argument fields.
Reliability:
- Respect approval and policy gates enforced by the backend.
- Do not claim an action was completed unless the tool result confirms it.
Memory:
- When you learn something about the user that will help you serve them better in future sessions — a preference, constraint, working style, important contact, or decision they've made — call save_memory.
- Only save things that are genuinely useful and not already obvious from their profile.
- Do not save generic facts or things about yourself.
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

function buildPlanningConversation(params: {
  prompt: string;
  history: AgentConversationMessage[];
  limit?: number;
}): AgentConversationMessage[] {
  const { prompt, history } = params;
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 120);
  const trimmedPrompt = prompt.trim();

  let conversation = history
    .map((message) => ({
      role: message.role,
      text: message.text.trim(),
    }))
    .filter((message) => message.text.length > 0)
    .slice(-limit);

  if (trimmedPrompt.length > 0) {
    const last = conversation[conversation.length - 1];
    if (!last || last.role !== "user" || last.text !== trimmedPrompt) {
      conversation = [...conversation, { role: "user", text: trimmedPrompt }];
    }
  }

  return conversation.slice(-limit);
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

function readIntegerEnv(
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsedValue, min), max);
}

function readAgentLoopStepLimit(): number {
  return readIntegerEnv("AGENT_MAX_LOOP_STEPS", 8, 1, 15);
}

function appendPlanningMessage(params: {
  conversation: AgentConversationMessage[];
  message: AgentConversationMessage;
  limit?: number;
}): AgentConversationMessage[] {
  const { conversation, message } = params;
  const limit = Math.min(Math.max(params.limit ?? 120, 1), 200);
  const text = message.text.trim();
  if (!text) {
    return conversation.slice(-limit);
  }

  return [...conversation, { role: message.role, text }].slice(-limit);
}

function stringifyForPlannerContext(
  value: unknown,
  maxLength = 3000,
): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return "{}";
    }
    if (serialized.length <= maxLength) {
      return serialized;
    }
    return `${serialized.slice(0, maxLength)}...`;
  } catch {
    return "{\"error\":\"serialization_failed\"}";
  }
}

function buildToolExecutionContextMessage(params: {
  toolName: string;
  toolArgs: AgentToolArgs;
  output: Record<string, unknown>;
}): string {
  const { toolName, toolArgs, output } = params;
  const argsJson = stringifyForPlannerContext(toolArgs, 1200);
  const outputJson = stringifyForPlannerContext(output, 2200);

  return [
    `[TOOL_EXECUTION_RESULT]`,
    `Tool: ${toolName}`,
    `Args JSON: ${argsJson}`,
    `Output JSON: ${outputJson}`,
    `This tool call has already been executed successfully.`,
    `If the user request is now complete, reply directly to the user.`,
    `If more work is required, call exactly one next tool.`,
  ].join("\n");
}

function buildAttachedContextBlock(
  attachedContext: AgentAttachedContextItem[] | undefined,
): string {
  if (!attachedContext || attachedContext.length === 0) {
    return "";
  }

  const lines = [
    "[ATTACHED CONTEXT]",
    "The user explicitly attached these artifacts for this run.",
    "Use this context when planning tool calls and responses.",
  ];

  for (const item of attachedContext.slice(0, 12)) {
    lines.push(`- Type: ${item.type}`);
    lines.push(`  Id: ${truncateText(item.id, 200)}`);

    if (item.title) {
      lines.push(`  Title: ${truncateText(item.title, 220)}`);
    }

    if (item.snippet) {
      lines.push(`  Snippet: ${truncateText(item.snippet, 900)}`);
    }

    if (item.meta && Object.keys(item.meta).length > 0) {
      lines.push(`  Meta JSON: ${stringifyForPlannerContext(item.meta, 1200)}`);
    }
  }

  lines.push("[END ATTACHED CONTEXT]");
  return lines.join("\n");
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
    skipThreadCheck: true,
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
  const initialActionRef = runRef.collection("actions").doc();
  const now = FieldValue.serverTimestamp();

  const runRefPath = runRef.path;
  const initialActionRefPath = initialActionRef.path;

  const toolSet = getAgentToolSet();
  const modelName = getGeminiModelName();
  let ensureRunInitialized: (() => Promise<void>) | null = null;

  try {
    const providedConversation = sanitizeConversationInput(request.conversation, 30);
    const attachedContext =
      request.attachedContext && request.attachedContext.length > 0
        ? request.attachedContext.slice(0, 12)
        : undefined;
    const attachedContextBlock = buildAttachedContextBlock(attachedContext);

    await ensureThreadForUser({
      uid: request.uid,
      threadId: request.threadId,
      source: request.source,
    });

    const runStartPromise = runRef
      .set({
        threadId: request.threadId,
        uid: request.uid,
        userEmail: request.userEmail,
        prompt: request.prompt,
        attachedContextCount: attachedContext?.length ?? 0,
        status: "planning",
        createdAt: now,
        startedAt: now,
        updatedAt: now,
        source: request.source,
      })
      .catch(() => undefined);

    const previousConversationPromise = providedConversation
      ? Promise.resolve<AgentConversationMessage[]>([])
      : listThreadConversationForModel({
          uid: request.uid,
          threadId: request.threadId,
          limit: 30,
          skipThreadCheck: true,
        });

    const userContextPromise = buildUserContextBlock(request.uid);

    const persistUserMessagePromise = appendThreadMessage({
      uid: request.uid,
      threadId: request.threadId,
      role: "user",
      text: request.prompt,
      runId: runRef.id,
      actionId: initialActionRef.id,
      skipThreadCheck: true,
    }).catch(() => undefined);

    const runInitializationPromise = Promise.all([
      runStartPromise,
      persistUserMessagePromise,
    ]).then(() => undefined);
    let runInitialized = false;
    const ensureInitialized = async () => {
      if (runInitialized) {
        return;
      }
      await runInitializationPromise;
      runInitialized = true;
    };
    ensureRunInitialized = ensureInitialized;

    const [previousConversation, userContext] = await Promise.all([
      previousConversationPromise,
      userContextPromise,
    ]);
    let planningConversation = buildPlanningConversation({
      prompt: request.prompt,
      history: providedConversation ?? previousConversation,
      limit: 30,
    });

    const systemInstructionParts = [
      userContext,
      attachedContextBlock,
      AGENT_SYSTEM_INSTRUCTION,
    ].filter((part) => part && part.trim().length > 0);
    const systemInstruction = systemInstructionParts.join("\n\n");

    const maxLoopSteps = readAgentLoopStepLimit();
    let lastActionId = initialActionRef.id;
    let lastModelUsed = modelName;
    let lastSuccessfulTool: {
      name: string;
      args: AgentToolArgs;
      output: Record<string, unknown>;
    } | null = null;

    for (let stepIndex = 0; stepIndex < maxLoopSteps; stepIndex += 1) {
      const plan = await generateGeminiAgentPlan({
        conversation: planningConversation,
        toolDeclarations: toolSet.declarations,
        systemInstruction,
        onTextDelta: request.onTextDelta,
      });
      lastModelUsed = plan.model;
      await ensureInitialized();

      const assistantText = plan.text.trim();
      if (assistantText.length > 0) {
        planningConversation = appendPlanningMessage({
          conversation: planningConversation,
          message: { role: "assistant", text: assistantText },
          limit: 120,
        });
      }

      const firstFunctionCall = plan.functionCalls.find(
        (functionCall) =>
          typeof functionCall.name === "string" &&
          functionCall.name.trim().length > 0,
      );

      if (!firstFunctionCall?.name) {
        const actionRef =
          stepIndex === 0 ? initialActionRef : runRef.collection("actions").doc();
        lastActionId = actionRef.id;

        const text =
          assistantText ||
          (lastSuccessfulTool
            ? `Executed ${lastSuccessfulTool.name} successfully.`
            : "Gemini completed without tool calls and returned no text output.");

        await actionRef.set({
          uid: request.uid,
          type: "assistant_response",
          status: "completed",
          confirmation: "not_required",
          tool: null,
          input: {
            prompt: request.prompt,
            step: stepIndex + 1,
          },
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

        if (lastSuccessfulTool) {
          return {
            ok: true,
            runId: runRef.id,
            actionId: actionRef.id,
            threadId: request.threadId,
            status: "completed",
            summary: text,
            mode: "tool_executed",
            model: plan.model,
            tool: lastSuccessfulTool.name,
            toolArgs: lastSuccessfulTool.args,
            output: lastSuccessfulTool.output,
          };
        }

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

      const actionRef =
        stepIndex === 0 ? initialActionRef : runRef.collection("actions").doc();
      const actionRefPath = actionRef.path;
      lastActionId = actionRef.id;

      const tool = toolSet.byName.get(firstFunctionCall.name);
      if (!tool) {
        const message = buildToolNotFoundMessage(firstFunctionCall.name);
        await actionRef.set({
          uid: request.uid,
          type: "tool_call",
          tool: firstFunctionCall.name,
          status: "failed",
          confirmation: "not_required",
          input: {
            prompt: request.prompt,
            functionCall: firstFunctionCall,
            step: stepIndex + 1,
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
            step: stepIndex + 1,
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

      const toolArgs: AgentToolArgs = JSON.parse(JSON.stringify(validatedArgs.value));
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
            step: stepIndex + 1,
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
            step: stepIndex + 1,
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
          step: stepIndex + 1,
        },
        policy,
        model: plan.model,
        createdAt: now,
        startedAt: now,
        updatedAt: now,
      });

      await runRef.set(
        {
          status: "executing",
          model: plan.model,
          updatedAt: now,
        },
        { merge: true },
      );

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

        lastSuccessfulTool = {
          name: tool.name,
          args: toolArgs,
          output,
        };
        planningConversation = appendPlanningMessage({
          conversation: planningConversation,
          message: {
            role: "assistant",
            text: buildToolExecutionContextMessage({
              toolName: tool.name,
              toolArgs,
              output,
            }),
          },
          limit: 120,
        });

        const isLastStep = stepIndex + 1 >= maxLoopSteps;
        if (isLastStep) {
          const summary = assistantText || `Executed ${tool.name} successfully.`;
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
        }
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
    }

    await ensureInitialized();
    const summary = `Reached max planning steps (${maxLoopSteps}).`;
    await runRef.set(
      {
        status: "completed",
        summary,
        model: lastModelUsed,
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
      actionId: lastActionId,
    });

    if (lastSuccessfulTool) {
      return {
        ok: true,
        runId: runRef.id,
        actionId: lastActionId,
        threadId: request.threadId,
        status: "completed",
        summary,
        mode: "tool_executed",
        model: lastModelUsed,
        tool: lastSuccessfulTool.name,
        toolArgs: lastSuccessfulTool.args,
        output: lastSuccessfulTool.output,
      };
    }

    return {
      ok: true,
      runId: runRef.id,
      actionId: lastActionId,
      threadId: request.threadId,
      status: "completed",
      summary,
      mode: "assistant_text",
      model: lastModelUsed,
    };
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Agent planning failed.";

    if (ensureRunInitialized) {
      await ensureRunInitialized();
    }

    await initialActionRef.set({
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
      actionRefPath: initialActionRefPath,
      message,
    });

    try {
      await persistAssistantThreadMessage({
        uid: request.uid,
        threadId: request.threadId,
        text: message,
        runId: runRef.id,
        actionId: initialActionRef.id,
      });
    } catch {
      // Ignore secondary chat persistence failures in error path.
    }

    return {
      ok: true,
      runId: runRef.id,
      actionId: initialActionRef.id,
      threadId: request.threadId,
      status: "failed",
      summary: message,
      mode: "assistant_text",
      model: modelName,
    };
  }
}
