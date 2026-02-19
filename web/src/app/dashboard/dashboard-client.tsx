"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./dashboard.module.css";

type DashboardClientProps = {
  user: {
    uid: string;
    email?: string | null;
    name?: string | null;
  };
};

type RunResponse = {
  ok: boolean;
  runId: string;
  actionId: string;
  threadId: string;
  status: string;
  summary: string;
  mode?: string;
  model?: string;
  tool?: string;
  toolArgs?: Record<string, unknown>;
  approval?: {
    id: string;
    tool: string;
    reason: string;
    preview: string;
  };
  output?: Record<string, unknown>;
};

type GoogleIntegrationStatus = {
  connected: boolean;
  accountEmail?: string | null;
  scopes?: string[];
  updatedAt?: string | null;
};

type ToolResult = Record<string, unknown> | null;

type GmailPendingApproval = {
  id: string;
  to: string;
  subject: string;
  bodyPreview: string;
};

type AgentPendingApproval = {
  id: string;
  tool: string;
  reason: string;
  preview: string;
  threadId?: string;
  runId?: string;
  actionId?: string;
};

type AgentPendingApprovalsResponse = {
  ok: boolean;
  pending: Array<{
    id: string;
    tool: string;
    reason: string;
    preview: string;
    threadId: string;
    runId: string;
    actionId: string;
  }>;
};

type AgentThreadMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt?: string | null;
  runId?: string | null;
  actionId?: string | null;
};

type AgentThreadResponse = {
  ok: boolean;
  threadId: string;
  messages: AgentThreadMessage[];
  pendingApprovals: Array<{
    id: string;
    tool: string;
    reason: string;
    preview: string;
    runId: string;
    actionId: string;
    createdAt?: string | null;
  }>;
};

type AgentRunStreamEvent =
  | { type: "status"; status: string; threadId: string }
  | { type: "delta"; delta: string }
  | { type: "result"; result: RunResponse }
  | { type: "error"; error: string };

type AgentConversationPayloadMessage = {
  role: "user" | "assistant";
  text: string;
};

type UpcomingCalendarDigestItem = {
  id: string | null;
  summary: string;
  description: string | null;
  startIso: string | null;
  endIso: string | null;
  htmlLink: string | null;
  location: string | null;
};

type RecentInboxDigestItem = {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  internalDateIso: string | null;
};

type CalendarUpcomingResponse = {
  ok: boolean;
  events: UpcomingCalendarDigestItem[];
};

type GmailRecentResponse = {
  ok: boolean;
  messages: RecentInboxDigestItem[];
};

const CALENDAR_DESCRIPTION_PREVIEW_LIMIT = 320;

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
    event.type === "result" ||
    event.type === "error"
  );
}

function isCalendarUpcomingResponse(value: unknown): value is CalendarUpcomingResponse {
  if (!value || typeof value !== "object" || !("events" in value)) {
    return false;
  }
  return Array.isArray((value as CalendarUpcomingResponse).events);
}

function isGmailRecentResponse(value: unknown): value is GmailRecentResponse {
  if (!value || typeof value !== "object" || !("messages" in value)) {
    return false;
  }
  return Array.isArray((value as GmailRecentResponse).messages);
}

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

function plusOneHourIso(): string {
  const value = new Date();
  value.setHours(value.getHours() + 1, 0, 0, 0);
  return value.toISOString().slice(0, 16);
}

function plusTwoHoursIso(): string {
  const value = new Date();
  value.setHours(value.getHours() + 2, 0, 0, 0);
  return value.toISOString().slice(0, 16);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "No timestamp";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "No timestamp";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function formatScopeLabel(scope: string): string {
  const prefix = "https://www.googleapis.com/auth/";
  if (scope.startsWith(prefix)) {
    return scope.slice(prefix.length);
  }
  return scope;
}

function buildCalendarEventKey(event: UpcomingCalendarDigestItem): string {
  return (
    event.id ??
    `${event.summary}-${event.startIso ?? "none"}-${event.endIso ?? "none"}`
  );
}

function truncateWithEllipsis(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit).trimEnd()}...`;
}

function createLocalMessage(params: {
  role: "user" | "assistant";
  text: string;
  runId?: string | null;
  actionId?: string | null;
}): AgentThreadMessage {
  const { role, text, runId, actionId } = params;
  return {
    id: `local-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    runId: runId ?? null,
    actionId: actionId ?? null,
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

export function DashboardClient({ user }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState(
    "Create a follow-up plan for this week and save the run.",
  );
  const [agentThreadId, setAgentThreadId] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentThreadMessage[]>([]);
  const [agentThreadLoading, setAgentThreadLoading] = useState(false);
  const [streamingAssistantText, setStreamingAssistantText] = useState("");
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [agentPendingApproval, setAgentPendingApproval] =
    useState<AgentPendingApproval | null>(null);
  const [agentApprovalFeedback, setAgentApprovalFeedback] = useState("");
  const [agentApprovalSubmitting, setAgentApprovalSubmitting] = useState(false);
  const [agentApprovalError, setAgentApprovalError] = useState<string | null>(null);
  const [agentApprovalResult, setAgentApprovalResult] = useState<ToolResult>(null);

  const [integrationLoading, setIntegrationLoading] = useState(true);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<GoogleIntegrationStatus | null>(
    null,
  );
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingCalendarDigestItem[]>(
    [],
  );
  const [recentInboxMessages, setRecentInboxMessages] = useState<
    RecentInboxDigestItem[]
  >([]);
  const [workspaceRefreshedAt, setWorkspaceRefreshedAt] = useState<string | null>(
    null,
  );
  const [expandedCalendarDescriptions, setExpandedCalendarDescriptions] =
    useState<Record<string, boolean>>({});

  const [gmailTo, setGmailTo] = useState("");
  const [gmailSubject, setGmailSubject] = useState("Quick check-in");
  const [gmailBody, setGmailBody] = useState(
    "Hey, this is a test email from the Jariv Agentic Portal.",
  );
  const [gmailSubmitting, setGmailSubmitting] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [gmailResult, setGmailResult] = useState<ToolResult>(null);
  const [gmailPendingApproval, setGmailPendingApproval] =
    useState<GmailPendingApproval | null>(null);
  const [gmailDecisionFeedback, setGmailDecisionFeedback] = useState("");
  const [gmailDecisionSubmitting, setGmailDecisionSubmitting] = useState(false);

  const [eventSummary, setEventSummary] = useState("Portal test event");
  const [eventDescription, setEventDescription] = useState(
    "Created from Jariv Agentic Portal dashboard.",
  );
  const [eventStartIso, setEventStartIso] = useState(plusOneHourIso());
  const [eventEndIso, setEventEndIso] = useState(plusTwoHoursIso());
  const [calendarSubmitting, setCalendarSubmitting] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarResult, setCalendarResult] = useState<ToolResult>(null);

  const oauthError = useMemo(() => {
    return searchParams.get("oauth_error");
  }, [searchParams]);

  const refreshGoogleStatus = useCallback(
    async (): Promise<GoogleIntegrationStatus | null> => {
      setIntegrationLoading(true);
      setIntegrationError(null);

      try {
        const response = await fetch("/api/integrations/google/status", {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as
          | GoogleIntegrationStatus
          | { error?: string }
          | null;

        if (!response.ok) {
          const message =
            body && "error" in body
              ? body.error
              : "Failed to fetch Google integration status.";
          throw new Error(message || "Failed to fetch Google integration status.");
        }

        const nextStatus = body as GoogleIntegrationStatus;
        setIntegration(nextStatus);
        return nextStatus;
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load integration status.";
        setIntegrationError(message);
        setIntegration(null);
        return null;
      } finally {
        setIntegrationLoading(false);
      }
    },
    [],
  );

  const refreshWorkspaceSnapshot = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);

    try {
      const [calendarResponse, inboxResponse] = await Promise.all([
        fetch("/api/tools/calendar/upcoming?limit=8", { cache: "no-store" }),
        fetch("/api/tools/gmail/recent?limit=8", { cache: "no-store" }),
      ]);

      const [calendarBody, inboxBody] = await Promise.all([
        (calendarResponse.json().catch(() => null)) as Promise<
          CalendarUpcomingResponse | { error?: string } | null
        >,
        (inboxResponse.json().catch(() => null)) as Promise<
          GmailRecentResponse | { error?: string } | null
        >,
      ]);

      if (calendarResponse.ok && isCalendarUpcomingResponse(calendarBody)) {
        setUpcomingEvents(calendarBody.events);
        setExpandedCalendarDescriptions((previous) => {
          const next: Record<string, boolean> = {};
          for (const event of calendarBody.events) {
            const eventKey = buildCalendarEventKey(event);
            if (previous[eventKey]) {
              next[eventKey] = true;
            }
          }
          return next;
        });
      } else {
        setUpcomingEvents([]);
        setExpandedCalendarDescriptions({});
      }

      if (inboxResponse.ok && isGmailRecentResponse(inboxBody)) {
        setRecentInboxMessages(inboxBody.messages);
      } else {
        setRecentInboxMessages([]);
      }

      const errors: string[] = [];
      if (!calendarResponse.ok) {
        errors.push(
          readErrorMessage(calendarBody, "Calendar preview is currently unavailable."),
        );
      }
      if (!inboxResponse.ok) {
        errors.push(
          readErrorMessage(inboxBody, "Inbox preview is currently unavailable."),
        );
      }
      setWorkspaceError(errors.length > 0 ? errors.join(" ") : null);
      setWorkspaceRefreshedAt(new Date().toISOString());
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load workspace snapshot.";
      setUpcomingEvents([]);
      setRecentInboxMessages([]);
      setExpandedCalendarDescriptions({});
      setWorkspaceError(message);
      setWorkspaceRefreshedAt(new Date().toISOString());
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  const handleRefreshWorkspace = useCallback(async () => {
    const status = await refreshGoogleStatus();
    if (status?.connected) {
      await refreshWorkspaceSnapshot();
      return;
    }

    setUpcomingEvents([]);
    setRecentInboxMessages([]);
    setExpandedCalendarDescriptions({});
    setWorkspaceError(null);
    setWorkspaceRefreshedAt(null);
  }, [refreshGoogleStatus, refreshWorkspaceSnapshot]);

  const refreshAgentThread = useCallback(async (threadId: string) => {
    setAgentThreadLoading(true);
    setAgentApprovalError(null);

    try {
      const response = await fetch(
        `/api/agent/thread?threadId=${encodeURIComponent(threadId)}`,
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
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load agent thread.";
      setAgentApprovalError(message);
    } finally {
      setAgentThreadLoading(false);
    }
  }, []);

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

      const first = isAgentPendingApprovalsResponse(body)
        ? body.pending[0]
        : null;
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
        setAgentThreadId(first.threadId);
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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const status = await refreshGoogleStatus();
      if (cancelled) {
        return;
      }

      if (status?.connected) {
        await refreshWorkspaceSnapshot();
      } else {
        setUpcomingEvents([]);
        setRecentInboxMessages([]);
        setWorkspaceError(null);
        setWorkspaceRefreshedAt(null);
      }

      void refreshAgentPendingApproval();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    refreshAgentPendingApproval,
    refreshGoogleStatus,
    refreshWorkspaceSnapshot,
  ]);

  async function handleRunAgentStub() {
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
    setAgentMessages((previous) => [...previous, optimisticUserMessage]);
    setPrompt("");

    try {
      const response = await fetch("/api/agent/run/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToSend,
          threadId: agentThreadId ?? undefined,
          conversation,
        }),
      });

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
  }

  async function handleRequestGmailApproval() {
    setGmailSubmitting(true);
    setGmailError(null);
    setGmailResult(null);
    setGmailPendingApproval(null);

    try {
      const response = await fetch("/api/tools/gmail/approval/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: gmailTo,
          subject: gmailSubject,
          bodyText: gmailBody,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (!response.ok) {
        throw new Error(readErrorMessage(body, "Gmail send failed."));
      }

      if (
        body &&
        typeof body === "object" &&
        "mode" in body &&
        body.mode === "requires_approval" &&
        "approval" in body &&
        body.approval &&
        typeof body.approval === "object" &&
        "id" in body.approval &&
        "to" in body.approval &&
        "subject" in body.approval &&
        "bodyPreview" in body.approval
      ) {
        setGmailPendingApproval(body.approval as GmailPendingApproval);
        setGmailResult({
          ok: true,
          mode: "requires_approval",
          approvalId: (body.approval as GmailPendingApproval).id,
        });
        return;
      }

      setGmailResult(body as Record<string, unknown>);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Gmail approval request failed.";
      setGmailError(message);
    } finally {
      setGmailSubmitting(false);
    }
  }

  async function handleResolveGmailApproval(
    decision: "reject" | "approve_once" | "approve_and_always_allow_recipient",
  ) {
    if (!gmailPendingApproval) {
      return;
    }

    setGmailDecisionSubmitting(true);
    setGmailError(null);
    setGmailResult(null);

    try {
      const response = await fetch("/api/tools/gmail/approval/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: gmailPendingApproval.id,
          decision,
          feedback: gmailDecisionFeedback,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (!response.ok) {
        throw new Error(readErrorMessage(body, "Failed to resolve approval."));
      }

      setGmailResult(body as Record<string, unknown>);
      setGmailPendingApproval(null);
      setGmailDecisionFeedback("");
      void refreshWorkspaceSnapshot();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to resolve Gmail approval.";
      setGmailError(message);
    } finally {
      setGmailDecisionSubmitting(false);
    }
  }

  async function handleResolveAgentApproval(
    decision: "reject" | "approve_once" | "approve_and_always_allow_recipient",
  ) {
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
        throw new Error(
          readErrorMessage(body, "Failed to resolve agent approval."),
        );
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
  }

  async function handleCreateCalendarEvent() {
    setCalendarSubmitting(true);
    setCalendarError(null);
    setCalendarResult(null);

    try {
      const response = await fetch("/api/tools/calendar/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: eventSummary,
          description: eventDescription,
          startIso: new Date(eventStartIso).toISOString(),
          endIso: new Date(eventEndIso).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (!response.ok) {
        throw new Error(readErrorMessage(body, "Calendar create failed."));
      }

      setCalendarResult(body as Record<string, unknown>);
      void refreshWorkspaceSnapshot();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Calendar create failed.";
      setCalendarError(message);
    } finally {
      setCalendarSubmitting(false);
    }
  }

  function handleStartNewConversation() {
    setAgentThreadId(null);
    setAgentMessages([]);
    setStreamingAssistantText("");
    setAgentPendingApproval(null);
    setAgentApprovalFeedback("");
    setAgentApprovalResult(null);
    setRunResult(null);
    setRunError(null);
    setPrompt("");
  }

  async function handleSignOut() {
    await fetch("/api/auth/session-logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const hasCalendarReadScope = Boolean(
    integration?.scopes?.includes("https://www.googleapis.com/auth/calendar.readonly"),
  );
  const hasGmailReadScope = Boolean(
    integration?.scopes?.includes("https://www.googleapis.com/auth/gmail.readonly"),
  );
  const pulseReady = hasCalendarReadScope && hasGmailReadScope;

  return (
    <main className={styles.page}>
      <div className={styles.backdropOrbOne} />
      <div className={styles.backdropOrbTwo} />
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <p className={styles.kicker}>Agent Workspace</p>
            <h1 className={styles.title}>Alik Control Deck</h1>
            <p className={styles.meta}>
              {user.name || user.email || user.uid} · {user.uid}
            </p>
          </div>
          <button type="button" className={styles.logoutButton} onClick={handleSignOut}>
            Sign out
          </button>
        </header>

        <section className={`${styles.panel} ${styles.heroPanel}`}>
          <p className={styles.heroLead}>
            Live context for your day, fast approvals, and one place to delegate to Alik.
          </p>
          <div className={styles.statGrid}>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Google</p>
              <p className={styles.statValue}>
                {integration?.connected ? "Connected" : "Not connected"}
              </p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Upcoming Events</p>
              <p className={styles.statValue}>{upcomingEvents.length}</p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Latest Emails</p>
              <p className={styles.statValue}>{recentInboxMessages.length}</p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Pending Approvals</p>
              <p className={styles.statValue}>{agentPendingApproval ? 1 : 0}</p>
            </article>
          </div>
        </section>

        {oauthError ? (
          <section className={styles.panel}>
            <p className={styles.error}>
              Google OAuth returned an error: <code>{oauthError}</code>
            </p>
          </section>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Google Workspace Integration</h2>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleRefreshWorkspace()}
              disabled={integrationLoading || workspaceLoading}
            >
              {integrationLoading ? "Checking..." : "Refresh workspace"}
            </button>
          </div>
          {integrationLoading ? <p className={styles.meta}>Checking status...</p> : null}
          {integrationError ? <p className={styles.error}>{integrationError}</p> : null}
          {!integrationLoading && !integrationError ? (
            <>
              <p className={styles.meta}>
                {integration?.connected
                  ? `Connected as ${integration.accountEmail || "unknown account"}`
                  : "Not connected yet."}
              </p>
              <div className={styles.buttonRow}>
                <a
                  className={styles.linkButton}
                  href="/api/oauth/google/start?returnTo=/dashboard"
                >
                  {integration?.connected ? "Reconnect Google" : "Connect Google"}
                </a>
              </div>
              {integration?.connected && integration.scopes?.length ? (
                <div className={styles.scopeList}>
                  {integration.scopes.map((scope) => (
                    <span key={scope} className={styles.scopeChip}>
                      {formatScopeLabel(scope)}
                    </span>
                  ))}
                </div>
              ) : null}
              {integration?.connected && !pulseReady ? (
                <p className={styles.error}>
                  Reconnect Google to grant `gmail.readonly` and `calendar.readonly`
                  so Alik can show inbox and calendar context.
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        <section className={`${styles.panel} ${styles.pulsePanel}`}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Workspace Pulse</h2>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleRefreshWorkspace()}
              disabled={
                workspaceLoading || integrationLoading || !integration?.connected
              }
            >
              {workspaceLoading ? "Refreshing..." : "Refresh pulse"}
            </button>
          </div>
          {!integration?.connected ? (
            <p className={styles.meta}>Connect Google to load your live workspace pulse.</p>
          ) : null}
          {workspaceError ? <p className={styles.error}>{workspaceError}</p> : null}
          <div className={styles.pulseGrid}>
            <article className={styles.pulseCard}>
              <h3 className={styles.cardTitle}>Upcoming Calendar</h3>
              {workspaceLoading ? <p className={styles.meta}>Loading events...</p> : null}
              {!workspaceLoading && upcomingEvents.length === 0 ? (
                <p className={styles.meta}>No upcoming events right now.</p>
              ) : null}
              <ul className={styles.pulseList}>
                {upcomingEvents.map((event) => {
                  const eventKey = buildCalendarEventKey(event);
                  const description = event.description?.trim() ?? "";
                  const isLongDescription =
                    description.length > CALENDAR_DESCRIPTION_PREVIEW_LIMIT;
                  const isExpanded = Boolean(expandedCalendarDescriptions[eventKey]);
                  const visibleDescription =
                    !isLongDescription || isExpanded
                      ? description
                      : truncateWithEllipsis(
                          description,
                          CALENDAR_DESCRIPTION_PREVIEW_LIMIT,
                        );

                  return (
                    <li key={eventKey} className={styles.pulseItem}>
                      <div className={styles.pulseItemHead}>
                        <p className={styles.pulseItemTitle}>{event.summary}</p>
                        {event.htmlLink ? (
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.inlineLink}
                          >
                            Open
                          </a>
                        ) : null}
                      </div>
                      <p className={styles.pulseItemMeta}>
                        {event.startIso ? formatDateTime(event.startIso) : "Time TBD"}
                        {event.endIso ? ` -> ${formatDateTime(event.endIso)}` : ""}
                      </p>
                      {event.location ? (
                        <p className={styles.pulseItemMeta}>{event.location}</p>
                      ) : null}
                      {description ? (
                        <>
                          <p className={styles.pulseSnippet}>{visibleDescription}</p>
                          {isLongDescription ? (
                            <button
                              type="button"
                              className={styles.inlineTextButton}
                              onClick={() =>
                                setExpandedCalendarDescriptions((previous) => ({
                                  ...previous,
                                  [eventKey]: !previous[eventKey],
                                }))
                              }
                            >
                              {isExpanded ? "Show less" : "Show more"}
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </article>
            <article className={styles.pulseCard}>
              <h3 className={styles.cardTitle}>Latest Inbox</h3>
              {workspaceLoading ? <p className={styles.meta}>Loading messages...</p> : null}
              {!workspaceLoading && recentInboxMessages.length === 0 ? (
                <p className={styles.meta}>No recent inbox messages to show.</p>
              ) : null}
              <ul className={styles.pulseList}>
                {recentInboxMessages.map((message) => (
                  <li key={message.id} className={styles.pulseItem}>
                    <div className={styles.pulseItemHead}>
                      <p className={styles.pulseItemTitle}>{message.subject}</p>
                      <p className={styles.pulseItemMeta}>
                        {formatDateTime(message.internalDateIso)}
                      </p>
                    </div>
                    <p className={styles.pulseItemMeta}>{message.from}</p>
                    {message.snippet ? (
                      <p className={styles.pulseSnippet}>{message.snippet}</p>
                    ) : null}
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${message.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.inlineLink}
                    >
                      Open in Gmail
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          </div>
          {workspaceRefreshedAt ? (
            <p className={styles.meta}>
              Last pulse refresh: {formatDateTime(workspaceRefreshedAt)}
            </p>
          ) : null}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Alik (Gemini Runtime)</h2>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleStartNewConversation}
            >
              New conversation
            </button>
            {agentThreadId ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void refreshAgentThread(agentThreadId)}
              >
                Refresh thread
              </button>
            ) : null}
          </div>

          <div className={styles.chatLog}>
            {agentThreadLoading ? (
              <p className={styles.meta}>Loading conversation...</p>
            ) : null}
            {agentMessages.length === 0 && !agentThreadLoading ? (
              <p className={styles.meta}>
                No messages yet. Ask Alik to plan, email, or schedule something.
              </p>
            ) : null}
            {agentMessages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? styles.chatMessageUser
                    : styles.chatMessageAssistant
                }
              >
                <p className={styles.chatRole}>
                  {message.role === "user" ? "You" : "Alik"}
                </p>
                <p className={styles.chatText}>{message.text}</p>
              </article>
            ))}
            {isSubmittingRun && streamingAssistantText.trim().length > 0 ? (
              <article className={styles.chatMessageAssistant}>
                <p className={styles.chatRole}>Alik</p>
                <p className={styles.chatText}>{streamingAssistantText}</p>
              </article>
            ) : null}
            {isSubmittingRun && streamingAssistantText.trim().length === 0 ? (
              <p className={styles.meta}>Alik is thinking...</p>
            ) : null}
          </div>

          <label htmlFor="prompt" className={styles.label}>
            Your message
          </label>
          <textarea
            id="prompt"
            className={styles.chatComposer}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask Alik to draft an email, create an event, or plan work..."
          />
          <button
            type="button"
            className={styles.runButton}
            onClick={handleRunAgentStub}
            disabled={isSubmittingRun || prompt.trim().length === 0}
          >
            {isSubmittingRun ? "Sending..." : "Send"}
          </button>

          {agentPendingApproval ? (
            <div className={styles.approvalCard}>
              <p className={styles.approvalTitle}>Agent Approval Required</p>
              <p className={styles.meta}>
                Tool: <strong>{agentPendingApproval.tool}</strong>
              </p>
              <p className={styles.meta}>{agentPendingApproval.reason}</p>
              <pre className={styles.result}>{agentPendingApproval.preview}</pre>
              <label className={styles.label}>
                If rejecting, what should change? (optional)
                <textarea
                  className={styles.textarea}
                  value={agentApprovalFeedback}
                  onChange={(event) => setAgentApprovalFeedback(event.target.value)}
                  placeholder="e.g., adjust recipient/date/content..."
                />
              </label>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={() => void handleResolveAgentApproval("reject")}
                  disabled={agentApprovalSubmitting}
                >
                  {agentApprovalSubmitting ? "Working..." : "No"}
                </button>
                <button
                  type="button"
                  className={styles.runButton}
                  onClick={() => void handleResolveAgentApproval("approve_once")}
                  disabled={agentApprovalSubmitting}
                >
                  {agentApprovalSubmitting ? "Working..." : "Yes"}
                </button>
                {agentPendingApproval.tool === "gmail_send" ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      void handleResolveAgentApproval(
                        "approve_and_always_allow_recipient",
                      )
                    }
                    disabled={agentApprovalSubmitting}
                  >
                    {agentApprovalSubmitting
                      ? "Working..."
                      : "Yes and always allow for this recipient"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {agentApprovalError ? <p className={styles.error}>{agentApprovalError}</p> : null}
          {agentApprovalResult ? (
            <pre className={styles.result}>
              {JSON.stringify(agentApprovalResult, null, 2)}
            </pre>
          ) : null}
          {runError ? <p className={styles.error}>{runError}</p> : null}
          {runResult ? (
            <pre className={styles.result}>{JSON.stringify(runResult, null, 2)}</pre>
          ) : null}
        </section>

        <div className={styles.toolsGrid}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Manual Gmail Send</h2>
            <input
              className={styles.input}
              placeholder="to@example.com"
              value={gmailTo}
              onChange={(event) => setGmailTo(event.target.value)}
            />
            <input
              className={styles.input}
              placeholder="Subject"
              value={gmailSubject}
              onChange={(event) => setGmailSubject(event.target.value)}
            />
            <textarea
              className={styles.textarea}
              value={gmailBody}
              onChange={(event) => setGmailBody(event.target.value)}
            />
            <button
              type="button"
              className={styles.runButton}
              onClick={handleRequestGmailApproval}
              disabled={gmailSubmitting}
            >
              {gmailSubmitting ? "Requesting..." : "Request send approval"}
            </button>

            {gmailPendingApproval ? (
              <div className={styles.approvalCard}>
                <p className={styles.approvalTitle}>Approval Required</p>
                <p className={styles.meta}>
                  The agent wants to send an email to{" "}
                  <strong>{gmailPendingApproval.to}</strong> with subject{" "}
                  <strong>{gmailPendingApproval.subject}</strong>.
                </p>
                <pre className={styles.result}>{gmailPendingApproval.bodyPreview}</pre>
                <label className={styles.label}>
                  If rejecting, what should change? (optional for now)
                  <textarea
                    className={styles.textarea}
                    value={gmailDecisionFeedback}
                    onChange={(event) => setGmailDecisionFeedback(event.target.value)}
                    placeholder="e.g., change tone, add details, different recipient..."
                  />
                </label>
                <div className={styles.buttonRow}>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => void handleResolveGmailApproval("reject")}
                    disabled={gmailDecisionSubmitting}
                  >
                    {gmailDecisionSubmitting ? "Working..." : "No"}
                  </button>
                  <button
                    type="button"
                    className={styles.runButton}
                    onClick={() => void handleResolveGmailApproval("approve_once")}
                    disabled={gmailDecisionSubmitting}
                  >
                    {gmailDecisionSubmitting ? "Working..." : "Yes"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      void handleResolveGmailApproval(
                        "approve_and_always_allow_recipient",
                      )
                    }
                    disabled={gmailDecisionSubmitting}
                  >
                    {gmailDecisionSubmitting
                      ? "Working..."
                      : "Yes and always allow for this recipient"}
                  </button>
                </div>
              </div>
            ) : null}

            {gmailError ? <p className={styles.error}>{gmailError}</p> : null}
            {gmailResult ? (
              <pre className={styles.result}>{JSON.stringify(gmailResult, null, 2)}</pre>
            ) : null}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Manual Calendar Event</h2>
            <input
              className={styles.input}
              placeholder="Summary"
              value={eventSummary}
              onChange={(event) => setEventSummary(event.target.value)}
            />
            <input
              className={styles.input}
              placeholder="Description"
              value={eventDescription}
              onChange={(event) => setEventDescription(event.target.value)}
            />
            <label className={styles.label}>
              Start
              <input
                className={styles.input}
                type="datetime-local"
                value={eventStartIso}
                onChange={(event) => setEventStartIso(event.target.value)}
              />
            </label>
            <label className={styles.label}>
              End
              <input
                className={styles.input}
                type="datetime-local"
                value={eventEndIso}
                onChange={(event) => setEventEndIso(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.runButton}
              onClick={handleCreateCalendarEvent}
              disabled={calendarSubmitting}
            >
              {calendarSubmitting ? "Creating..." : "Create event"}
            </button>
            {calendarError ? <p className={styles.error}>{calendarError}</p> : null}
            {calendarResult ? (
              <pre className={styles.result}>
                {JSON.stringify(calendarResult, null, 2)}
              </pre>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
