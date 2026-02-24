import { useCallback, useRef, useState } from "react";
import type {
  AgentConversationPayloadMessage,
  AgentPendingApproval,
  AgentPendingApprovalsResponse,
  AgentRunStreamEvent,
  AgentThreadMessage,
  AgentThreadResponse,
  AttachedContextItem,
  RunResponse,
  ToolResult,
} from "../types";

type AgentApprovalDecision =
  | "reject"
  | "approve_once"
  | "approve_and_always_allow_recipient";

type OpenAgentThreadOptions = {
  scrollToTop?: boolean;
};

type ThinkingStep = {
  toolName: string;
  preview: string;
};

type UseChatRunnerParams = {
  initialPrompt?: string;
};

function readErrorMessage(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string" &&
    value.error.trim().length > 0
  ) {
    return value.error;
  }

  return fallback;
}

function isAgentPendingApprovalsResponse(
  value: unknown,
): value is AgentPendingApprovalsResponse {
  if (!value || typeof value !== "object" || !("pending" in value)) {
    return false;
  }

  const pending = (value as AgentPendingApprovalsResponse).pending;
  return Array.isArray(pending);
}

function isAgentThreadResponse(value: unknown): value is AgentThreadResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("messages" in value) || !("pendingApprovals" in value)) {
    return false;
  }

  const typed = value as AgentThreadResponse;
  return Array.isArray(typed.messages) && Array.isArray(typed.pendingApprovals);
}

function isAgentRunStreamEvent(value: unknown): value is AgentRunStreamEvent {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  const event = value as { type?: unknown };
  return (
    event.type === "status" ||
    event.type === "delta" ||
    event.type === "thought_delta" ||
    event.type === "tool_call" ||
    event.type === "result" ||
    event.type === "error"
  );
}

function createLocalMessage(params: {
  role: "user" | "assistant";
  text: string;
  runId?: string | null;
  actionId?: string | null;
  toolSteps?: Array<{ toolName: string; preview: string }>;
}): AgentThreadMessage {
  const { role, text, runId, actionId, toolSteps } = params;
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    runId: runId ?? null,
    actionId: actionId ?? null,
    toolSteps: toolSteps && toolSteps.length > 0 ? toolSteps : undefined,
  };
}

function buildConversationForRequest(params: {
  messages: AgentThreadMessage[];
  prompt: string;
  limit?: number;
}): AgentConversationPayloadMessage[] {
  const { messages, prompt } = params;
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 120);
  const trimmedPrompt = prompt.trim();

  const conversation = messages
    .map((message) => ({
      role: message.role,
      text: message.text.trim(),
    }))
    .filter((message) => message.text.length > 0)
    .slice(-limit);

  if (trimmedPrompt.length > 0) {
    const last = conversation[conversation.length - 1];
    if (!last || last.role !== "user" || last.text !== trimmedPrompt) {
      conversation.push({ role: "user", text: trimmedPrompt });
    }
  }

  return conversation.slice(-limit);
}

export function useChatRunner(params: UseChatRunnerParams = {}) {
  const [prompt, setPrompt] = useState(
    params.initialPrompt ?? "Create a follow-up plan for this week and save the run.",
  );
  const [agentThreadId, setAgentThreadId] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentThreadMessage[]>([]);
  const [agentThreadLoading, setAgentThreadLoading] = useState(false);
  const [agentThreadOpeningId, setAgentThreadOpeningId] = useState<string | null>(
    null,
  );
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [thoughtText, setThoughtText] = useState("");
  const [thoughtExpanded, setThoughtExpanded] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [agentPendingApproval, setAgentPendingApproval] =
    useState<AgentPendingApproval | null>(null);
  const [agentApprovalFeedback, setAgentApprovalFeedback] = useState("");
  const [agentApprovalSubmitting, setAgentApprovalSubmitting] = useState(false);
  const [agentApprovalError, setAgentApprovalError] = useState<string | null>(null);
  const [agentApprovalResult, setAgentApprovalResult] = useState<ToolResult>(null);
  const [pinnedContext, setPinnedContext] = useState<AttachedContextItem[]>([]);

  const latestThreadRequestIdRef = useRef(0);

  const refreshAgentThread = useCallback(async (threadId: string) => {
    const normalizedThreadId = threadId.trim();
    if (!normalizedThreadId) {
      return;
    }

    const requestId = latestThreadRequestIdRef.current + 1;
    latestThreadRequestIdRef.current = requestId;

    setAgentThreadLoading(true);
    setAgentThreadOpeningId(normalizedThreadId);
    setAgentApprovalError(null);

    try {
      const response = await fetch(
        `/api/agent/thread?threadId=${encodeURIComponent(normalizedThreadId)}`,
        {
          cache: "no-store",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | AgentThreadResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(readErrorMessage(body, "Failed to load thread."));
      }

      if (!isAgentThreadResponse(body)) {
        throw new Error("Invalid thread response.");
      }

      if (latestThreadRequestIdRef.current !== requestId) {
        return;
      }

      setAgentThreadId(body.threadId);
      setAgentMessages(body.messages);

      const firstPending = body.pendingApprovals[0];
      if (firstPending) {
        setAgentPendingApproval({
          id: firstPending.id,
          tool: firstPending.tool,
          reason: firstPending.reason,
          preview: firstPending.preview,
          threadId: body.threadId,
          runId: firstPending.runId,
          actionId: firstPending.actionId,
        });
      } else {
        setAgentPendingApproval(null);
      }
    } catch (caughtError) {
      if (latestThreadRequestIdRef.current !== requestId) {
        return;
      }
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load agent thread.";
      setAgentApprovalError(message);
    } finally {
      if (latestThreadRequestIdRef.current === requestId) {
        setAgentThreadLoading(false);
        setAgentThreadOpeningId(null);
      }
    }
  }, []);

  const openAgentThread = useCallback(
    (
      threadId: string | null | undefined,
      options?: OpenAgentThreadOptions,
    ) => {
      const normalizedThreadId = threadId?.trim() ?? "";
      if (!normalizedThreadId) {
        return;
      }
      if (agentThreadOpeningId === normalizedThreadId) {
        return;
      }
      if (options?.scrollToTop) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      void refreshAgentThread(normalizedThreadId);
    },
    [agentThreadOpeningId, refreshAgentThread],
  );

  const refreshAgentPendingApproval = useCallback(async () => {
    setAgentApprovalError(null);
    try {
      const response = await fetch("/api/agent/approvals/pending?limit=1", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | AgentPendingApprovalsResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(readErrorMessage(body, "Failed to fetch approvals."));
      }

      const first = isAgentPendingApprovalsResponse(body) ? body.pending[0] : null;
      if (!first) {
        setAgentPendingApproval(null);
        return;
      }

      setAgentPendingApproval({
        id: first.id,
        tool: first.tool,
        reason: first.reason,
        preview: first.preview,
        threadId: first.threadId,
        runId: first.runId,
        actionId: first.actionId,
      });

      if (first.threadId) {
        await refreshAgentThread(first.threadId);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to fetch pending agent approval.";
      setAgentApprovalError(message);
    }
  }, [refreshAgentThread]);

  const handleRunAgentStub = useCallback(async () => {
    const promptToSend = prompt.trim();
    if (!promptToSend) {
      return;
    }

    const optimisticUserMessage = createLocalMessage({
      role: "user",
      text: promptToSend,
    });
    const conversation = buildConversationForRequest({
      messages: agentMessages,
      prompt: promptToSend,
      limit: 30,
    });

    setIsSubmittingRun(true);
    setRunError(null);
    setRunResult(null);
    setAgentApprovalError(null);
    setAgentApprovalResult(null);
    setStreamingAssistantText("");
    setThinkingSteps([]);
    setThoughtText("");
    setThoughtExpanded(false);
    setAgentMessages((previous) => [...previous, optimisticUserMessage]);
    setPrompt("");

    const completedThinkingSteps: Array<{ toolName: string; preview: string }> = [];

    try {
      const response = await fetch("/api/agent/run/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToSend,
          threadId: agentThreadId ?? undefined,
          conversation,
          attachedContext: pinnedContext.length > 0 ? pinnedContext : undefined,
        }),
      });
      setPinnedContext([]);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "Agent run failed.");
      }

      if (!response.body) {
        throw new Error("Agent stream did not return a body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let runResponse: RunResponse | null = null;
      let streamedAssistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");

          if (!line) {
            continue;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }

          if (!isAgentRunStreamEvent(parsed)) {
            continue;
          }

          if (parsed.type === "status") {
            if (parsed.threadId) {
              setAgentThreadId(parsed.threadId);
            }
            continue;
          }

          if (parsed.type === "delta") {
            if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
              streamedAssistantText += parsed.delta;
              setStreamingAssistantText(streamedAssistantText);
            }
            continue;
          }

          if (parsed.type === "thought_delta") {
            if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
              setThoughtText((prev) => {
                if (prev.length === 0) {
                  setThoughtExpanded(true);
                }
                return prev + parsed.delta;
              });
            }
            continue;
          }

          if (parsed.type === "tool_call") {
            const step = { toolName: parsed.toolName, preview: parsed.preview };
            completedThinkingSteps.push(step);
            setThinkingSteps((prev) => [...prev, step]);
            continue;
          }

          if (parsed.type === "result") {
            runResponse = parsed.result;
            continue;
          }

          if (parsed.type === "error") {
            throw new Error(parsed.error || "Agent stream failed.");
          }
        }
      }

      if (!runResponse) {
        throw new Error("Agent stream ended without a final result.");
      }

      setRunResult(runResponse);
      setAgentThreadId(runResponse.threadId);

      if (
        runResponse.mode === "requires_approval" &&
        runResponse.approval?.id &&
        runResponse.approval.tool
      ) {
        setAgentPendingApproval({
          id: runResponse.approval.id,
          tool: runResponse.approval.tool,
          reason: runResponse.approval.reason,
          preview: runResponse.approval.preview,
          threadId: runResponse.threadId,
          runId: runResponse.runId,
          actionId: runResponse.actionId,
        });
      } else {
        setAgentPendingApproval(null);
      }

      let assistantText = streamedAssistantText.trim();
      if (
        assistantText.length === 0 &&
        runResponse.mode === "requires_approval" &&
        runResponse.approval?.tool
      ) {
        assistantText = [
          "I can run this action, but I need your approval first.",
          `Tool: ${runResponse.approval.tool}.`,
          runResponse.approval.preview
            ? `Plan: ${runResponse.approval.preview}`
            : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(" ");
      }

      if (assistantText.length === 0 && runResponse.summary?.trim()) {
        assistantText = runResponse.summary.trim();
      }

      if (assistantText.length > 0) {
        const localAssistantMessage = createLocalMessage({
          role: "assistant",
          text: assistantText,
          runId: runResponse.runId,
          actionId: runResponse.actionId,
          toolSteps: completedThinkingSteps.length > 0 ? completedThinkingSteps : undefined,
        });
        setAgentMessages((previous) => [...previous, localAssistantMessage]);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unexpected request failure.";
      setRunError(message);
      setPrompt((previous) =>
        previous.trim().length === 0 ? promptToSend : previous,
      );
    } finally {
      setStreamingAssistantText("");
      setIsSubmittingRun(false);
    }
  }, [agentMessages, agentThreadId, pinnedContext, prompt]);

  const handleResolveAgentApproval = useCallback(
    async (decision: AgentApprovalDecision) => {
      if (!agentPendingApproval) {
        return;
      }
      const targetThreadId = agentPendingApproval.threadId ?? agentThreadId;

      setAgentApprovalSubmitting(true);
      setAgentApprovalError(null);
      setAgentApprovalResult(null);

      try {
        const response = await fetch("/api/agent/approvals/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approvalId: agentPendingApproval.id,
            decision,
            feedback: agentApprovalFeedback,
          }),
        });

        const body = (await response.json().catch(() => null)) as
          | Record<string, unknown>
          | null;

        if (!response.ok) {
          throw new Error(readErrorMessage(body, "Failed to resolve agent approval."));
        }

        setAgentApprovalResult(body as Record<string, unknown>);
        setAgentPendingApproval(null);
        setAgentApprovalFeedback("");
        if (targetThreadId) {
          await refreshAgentThread(targetThreadId);
        } else {
          await refreshAgentPendingApproval();
        }
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to resolve agent approval.";
        setAgentApprovalError(message);
      } finally {
        setAgentApprovalSubmitting(false);
      }
    },
    [
      agentApprovalFeedback,
      agentPendingApproval,
      agentThreadId,
      refreshAgentPendingApproval,
      refreshAgentThread,
    ],
  );

  const handleStartNewConversation = useCallback(() => {
    latestThreadRequestIdRef.current += 1;
    setAgentThreadId(null);
    setAgentThreadLoading(false);
    setAgentThreadOpeningId(null);
    setAgentMessages([]);
    setStreamingAssistantText("");
    setAgentPendingApproval(null);
    setAgentApprovalFeedback("");
    setAgentApprovalResult(null);
    setRunResult(null);
    setRunError(null);
    setPrompt("");
  }, []);

  return {
    prompt,
    setPrompt,
    agentThreadId,
    agentMessages,
    agentThreadLoading,
    agentThreadOpeningId,
    streamingAssistantText,
    isSubmittingRun,
    thinkingSteps,
    thoughtText,
    thoughtExpanded,
    setThoughtExpanded,
    runResult,
    runError,
    agentPendingApproval,
    agentApprovalFeedback,
    setAgentApprovalFeedback,
    agentApprovalSubmitting,
    agentApprovalError,
    agentApprovalResult,
    pinnedContext,
    setPinnedContext,
    refreshAgentThread,
    openAgentThread,
    refreshAgentPendingApproval,
    handleRunAgentStub,
    handleResolveAgentApproval,
    handleStartNewConversation,
  };
}
