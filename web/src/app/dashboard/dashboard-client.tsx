"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

type RecentGmailDraftItem = {
  id: string;
  messageId: string | null;
  threadId: string | null;
  to: string;
  subject: string;
  snippet: string;
  updatedAtIso: string | null;
};

type GmailDraftsResponse = {
  ok: boolean;
  drafts: RecentGmailDraftItem[];
};

type BriefingPrepareResponse = {
  ok: boolean;
  cached: boolean;
  summary: string;
  dateKey: string;
  timezone: string;
  source: string;
  generatedAtIso: string | null;
  metadata?: {
    eventCount?: number;
    messageCount?: number;
  };
};

type SlackSettingsResponse = {
  ok: boolean;
  hasToken: boolean;
};

type AgentTrustLevel = "supervised" | "delegated" | "autonomous";

type AttachedContextItem = {
  type: "email" | "calendar_event";
  id: string;
  title?: string;
  snippet?: string;
  meta?: Record<string, unknown>;
};

type ActivityRun = {
  id: string;
  status: string;
  summary: string | null;
  prompt: string | null;
  tool: string | null;
  model: string | null;
  threadId: string | null;
  createdAt: string | null;
};

type MemoryEntry = {
  id: string;
  source: string;
  content: string;
  confidence: "high" | "medium";
  threadId?: string;
  tags?: string[];
};

type ThreadSummary = {
  id: string;
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  lastMessageRole: "user" | "assistant" | null;
  lastMessageTextPreview: string;
};

type AgentTrustLevelResponse = {
  ok: boolean;
  trustLevel: AgentTrustLevel;
  source?: string;
};

const CALENDAR_DESCRIPTION_PREVIEW_LIMIT = 320;
const AGENT_TRUST_LEVEL_OPTIONS: Array<{
  value: AgentTrustLevel;
  label: string;
  summary: string;
}> = [
    {
      value: "supervised",
      label: "Supervised",
      summary: "Ask before every side-effect action.",
    },
    {
      value: "delegated",
      label: "Delegated",
      summary: "Auto-send to allowlisted recipients, ask for other side effects.",
    },
    {
      value: "autonomous",
      label: "Autonomous",
      summary: "Allow side-effect actions and report outcomes.",
    },
  ];

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

function isGmailDraftsResponse(value: unknown): value is GmailDraftsResponse {
  if (!value || typeof value !== "object" || !("drafts" in value)) {
    return false;
  }
  return Array.isArray((value as GmailDraftsResponse).drafts);
}

function isBriefingPrepareResponse(
  value: unknown,
): value is BriefingPrepareResponse {
  if (
    !value ||
    typeof value !== "object" ||
    !("summary" in value) ||
    !("dateKey" in value)
  ) {
    return false;
  }

  const typed = value as BriefingPrepareResponse;
  return (
    typeof typed.summary === "string" &&
    typeof typed.dateKey === "string" &&
    typeof typed.cached === "boolean"
  );
}

function isSlackSettingsResponse(value: unknown): value is SlackSettingsResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  return (
    "hasToken" in value &&
    typeof (value as { hasToken?: unknown }).hasToken === "boolean"
  );
}

function isAgentTrustLevel(value: unknown): value is AgentTrustLevel {
  return (
    value === "supervised" || value === "delegated" || value === "autonomous"
  );
}

function isAgentTrustLevelResponse(value: unknown): value is AgentTrustLevelResponse {
  if (!value || typeof value !== "object" || !("trustLevel" in value)) {
    return false;
  }
  return isAgentTrustLevel((value as AgentTrustLevelResponse).trustLevel);
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

function formatTrustLevelLabel(level: AgentTrustLevel): string {
  const match = AGENT_TRUST_LEVEL_OPTIONS.find((option) => option.value === level);
  return match?.label ?? level;
}

function formatRunStatus(status: string): string {
  switch (status) {
    case "completed": return "✓ Completed";
    case "failed": return "✗ Failed";
    case "awaiting_confirmation": return "⏳ Awaiting approval";
    case "planning": return "… Planning";
    case "executing": return "… Executing";
    default: return status;
  }
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
  const [agentTrustLevel, setAgentTrustLevel] =
    useState<AgentTrustLevel>("supervised");
  const [agentTrustLevelSource, setAgentTrustLevelSource] = useState<string | null>(
    null,
  );
  const [agentTrustLoading, setAgentTrustLoading] = useState(true);
  const [agentTrustSubmitting, setAgentTrustSubmitting] = useState(false);
  const [agentTrustError, setAgentTrustError] = useState<string | null>(null);
  const [agentTrustMessage, setAgentTrustMessage] = useState<string | null>(null);

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
  const [recentDrafts, setRecentDrafts] = useState<RecentGmailDraftItem[]>([]);
  const [workspaceRefreshedAt, setWorkspaceRefreshedAt] = useState<string | null>(
    null,
  );
  const [expandedCalendarDescriptions, setExpandedCalendarDescriptions] =
    useState<Record<string, boolean>>({});

  const [draftSendLoadingId, setDraftSendLoadingId] = useState<string | null>(null);
  const [draftConfirmId, setDraftConfirmId] = useState<string | null>(null);

  const [pinnedContext, setPinnedContext] = useState<AttachedContextItem[]>([]);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);
  const [preparedBriefingSummary, setPreparedBriefingSummary] = useState<
    string | null
  >(null);
  const [preparedBriefingDateKey, setPreparedBriefingDateKey] = useState<
    string | null
  >(null);
  const [preparedBriefingConsumed, setPreparedBriefingConsumed] = useState(false);
  const chatLogRef = useRef<HTMLDivElement>(null);

  const [activityRuns, setActivityRuns] = useState<ActivityRun[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [threadsHasMore, setThreadsHasMore] = useState(false);
  const [threadsCursor, setThreadsCursor] = useState<string | null>(null);

  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [profileOrganization, setProfileOrganization] = useState("");
  const [profileTimezone, setProfileTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [profileInterests, setProfileInterests] = useState("");
  const [profileProjects, setProfileProjects] = useState("");
  const [profileNotes, setProfileNotes] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [slackToken, setSlackToken] = useState("");
  const [slackHasToken, setSlackHasToken] = useState(false);
  const [slackChecking, setSlackChecking] = useState(false);
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackSaved, setSlackSaved] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);

  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(true);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryDeletingId, setMemoryDeletingId] = useState<string | null>(null);

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

  const refreshAgentTrustLevel = useCallback(async () => {
    setAgentTrustLoading(true);
    setAgentTrustError(null);

    try {
      const response = await fetch("/api/agent/trust-level", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | AgentTrustLevelResponse
        | { error?: string; source?: string }
        | null;

      if (!response.ok || !isAgentTrustLevelResponse(body)) {
        throw new Error(
          readErrorMessage(body, "Failed to load agent trust level."),
        );
      }

      setAgentTrustLevel(body.trustLevel);
      setAgentTrustLevelSource(
        typeof body.source === "string" ? body.source : null,
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load trust settings.";
      setAgentTrustError(message);
    } finally {
      setAgentTrustLoading(false);
    }
  }, []);

  const refreshWorkspaceSnapshot = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError(null);

    try {
      const [calendarResponse, inboxResponse, draftsResponse] = await Promise.all([
        fetch("/api/tools/calendar/upcoming?limit=8", { cache: "no-store" }),
        fetch("/api/tools/gmail/recent?limit=8", { cache: "no-store" }),
        fetch("/api/tools/gmail/drafts?limit=8", { cache: "no-store" }),
      ]);

      const [calendarBody, inboxBody, draftsBody] = await Promise.all([
        (calendarResponse.json().catch(() => null)) as Promise<
          CalendarUpcomingResponse | { error?: string } | null
        >,
        (inboxResponse.json().catch(() => null)) as Promise<
          GmailRecentResponse | { error?: string } | null
        >,
        (draftsResponse.json().catch(() => null)) as Promise<
          GmailDraftsResponse | { error?: string } | null
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

      if (draftsResponse.ok && isGmailDraftsResponse(draftsBody)) {
        setRecentDrafts(draftsBody.drafts);
      } else {
        setRecentDrafts([]);
      }
      setDraftConfirmId(null);
      setDraftSendLoadingId(null);

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
      if (!draftsResponse.ok) {
        errors.push(
          readErrorMessage(draftsBody, "Drafts preview is currently unavailable."),
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
      setRecentDrafts([]);
      setDraftConfirmId(null);
      setDraftSendLoadingId(null);
      setExpandedCalendarDescriptions({});
      setWorkspaceError(message);
      setWorkspaceRefreshedAt(new Date().toISOString());
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const response = await fetch("/api/user/profile", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; profile: Record<string, unknown> }
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body && "error" in body ? body.error : "Failed to load profile.",
        );
      }
      const p = (body as { ok: boolean; profile: Record<string, unknown> }).profile;
      setProfileDisplayName(typeof p.displayName === "string" ? p.displayName : "");
      setProfileRole(typeof p.role === "string" ? p.role : "");
      setProfileOrganization(typeof p.organization === "string" ? p.organization : "");
      setProfileTimezone(
        typeof p.timezone === "string"
          ? p.timezone
          : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      );
      setProfileInterests(
        Array.isArray(p.interests) ? (p.interests as string[]).join("\n") : "",
      );
      setProfileProjects(
        Array.isArray(p.ongoingProjects)
          ? (p.ongoingProjects as string[]).join("\n")
          : "",
      );
      setProfileNotes(typeof p.notes === "string" ? p.notes : "");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Could not load profile.";
      setProfileError(message);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshMemory = useCallback(async () => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const response = await fetch("/api/user/memory?limit=50", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; entries: MemoryEntry[] }
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body && "error" in body ? body.error : "Failed to load memory.",
        );
      }
      setMemoryEntries((body as { ok: boolean; entries: MemoryEntry[] }).entries ?? []);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Could not load memory.";
      setMemoryError(message);
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  const loadSlackStatus = useCallback(async () => {
    setSlackChecking(true);
    setSlackError(null);
    try {
      const response = await fetch("/api/user/settings/slack", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | SlackSettingsResponse
        | { error?: string }
        | null;

      if (!response.ok || !isSlackSettingsResponse(body)) {
        throw new Error(readErrorMessage(body, "Failed to load Slack settings."));
      }

      setSlackHasToken(body.hasToken);
    } catch (caughtError) {
      setSlackHasToken(false);
      setSlackError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load Slack settings.",
      );
    } finally {
      setSlackChecking(false);
    }
  }, []);

  const prepareBriefing = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/briefing/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await response.json().catch(() => null)) as
        | BriefingPrepareResponse
        | { error?: string }
        | null;

      if (!response.ok || !isBriefingPrepareResponse(body)) {
        return;
      }

      const summary = body.summary.trim();
      if (summary.length === 0) {
        return;
      }

      setPreparedBriefingSummary(summary);
      setPreparedBriefingDateKey(body.dateKey);
      setPreparedBriefingConsumed(false);
    } catch {
      // Keep this silent; briefing prep is best-effort.
    }
  }, []);

  async function handleDeleteMemoryEntry(id: string) {
    setMemoryDeletingId(id);
    try {
      const response = await fetch(`/api/user/memory?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Failed to delete entry.");
      }
      setMemoryEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // Silently ignore — entry stays visible if delete fails
    } finally {
      setMemoryDeletingId(null);
    }
  }

  const refreshActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const response = await fetch("/api/user/activity?limit=20", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; runs: ActivityRun[] }
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body && "error" in body ? body.error : "Failed to load activity.",
        );
      }
      setActivityRuns((body as { ok: boolean; runs: ActivityRun[] }).runs ?? []);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Could not load activity.";
      setActivityError(message);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const refreshThreads = useCallback(async (cursor?: string | null) => {
    if (!cursor) {
      setThreadsLoading(true);
      setThreadsError(null);
    }
    try {
      const url = cursor
        ? `/api/agent/threads?limit=20&cursor=${encodeURIComponent(cursor)}`
        : "/api/agent/threads?limit=20";
      const response = await fetch(url, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; threads: ThreadSummary[]; hasMore: boolean; nextCursor: string | null }
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body && "error" in body ? body.error : "Failed to load threads.",
        );
      }
      const data = body as { ok: boolean; threads: ThreadSummary[]; hasMore: boolean; nextCursor: string | null };
      setThreads((prev) => cursor ? [...prev, ...data.threads] : data.threads);
      setThreadsHasMore(data.hasMore);
      setThreadsCursor(data.nextCursor);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Could not load threads.";
      setThreadsError(message);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const handleRefreshWorkspace = useCallback(async () => {
    const status = await refreshGoogleStatus();
    if (status?.connected) {
      await refreshWorkspaceSnapshot();
      void prepareBriefing();
      return;
    }

    setUpcomingEvents([]);
    setRecentInboxMessages([]);
    setRecentDrafts([]);
    setPreparedBriefingSummary(null);
    setPreparedBriefingDateKey(null);
    setPreparedBriefingConsumed(false);
    setExpandedCalendarDescriptions({});
    setWorkspaceError(null);
    setWorkspaceRefreshedAt(null);
  }, [prepareBriefing, refreshGoogleStatus, refreshWorkspaceSnapshot]);

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

  async function handleSetAgentTrustLevel(nextTrustLevel: AgentTrustLevel) {
    if (agentTrustSubmitting || nextTrustLevel === agentTrustLevel) {
      return;
    }

    setAgentTrustSubmitting(true);
    setAgentTrustError(null);
    setAgentTrustMessage(null);

    try {
      const response = await fetch("/api/agent/trust-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trustLevel: nextTrustLevel }),
      });

      const body = (await response.json().catch(() => null)) as
        | AgentTrustLevelResponse
        | { error?: string }
        | null;

      if (!response.ok || !isAgentTrustLevelResponse(body)) {
        throw new Error(
          readErrorMessage(body, "Failed to update trust level."),
        );
      }

      setAgentTrustLevel(body.trustLevel);
      setAgentTrustLevelSource("settings");
      setAgentTrustMessage(
        `Autonomy mode set to ${formatTrustLevelLabel(body.trustLevel)}.`,
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to update trust level.";
      setAgentTrustError(message);
    } finally {
      setAgentTrustSubmitting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      void refreshAgentTrustLevel();
      void loadProfile();
      void loadSlackStatus();
      void refreshMemory();
      void refreshActivity();
      void refreshThreads();
      const status = await refreshGoogleStatus();
      if (cancelled) {
        return;
      }

      if (status?.connected) {
        await refreshWorkspaceSnapshot();
        void prepareBriefing();
      } else {
        setUpcomingEvents([]);
        setRecentInboxMessages([]);
        setRecentDrafts([]);
        setPreparedBriefingSummary(null);
        setPreparedBriefingDateKey(null);
        setPreparedBriefingConsumed(false);
        setWorkspaceError(null);
        setWorkspaceRefreshedAt(null);
      }

      void refreshAgentPendingApproval();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    loadProfile,
    loadSlackStatus,
    refreshActivity,
    refreshAgentPendingApproval,
    refreshAgentTrustLevel,
    refreshGoogleStatus,
    refreshMemory,
    prepareBriefing,
    refreshThreads,
    refreshWorkspaceSnapshot,
  ]);

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [agentMessages, streamingAssistantText]);

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

  async function handleRequestBriefing() {
    if (isBriefingLoading || isSubmittingRun) {
      return;
    }

    const cachedSummary = preparedBriefingSummary?.trim() ?? "";
    if (cachedSummary.length > 0 && !preparedBriefingConsumed) {
      setRunError(null);
      setRunResult(null);
      setAgentApprovalError(null);
      setAgentApprovalResult(null);
      setStreamingAssistantText("");
      setAgentMessages((previous) => [
        ...previous,
        createLocalMessage({
          role: "assistant",
          text: cachedSummary,
        }),
      ]);
      setPreparedBriefingConsumed(true);
      return;
    }

    setIsBriefingLoading(true);
    setRunError(null);
    setRunResult(null);
    setAgentApprovalError(null);
    setAgentApprovalResult(null);
    setStreamingAssistantText("");

    try {
      const response = await fetch("/api/agent/briefing/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: agentThreadId ?? undefined }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "Briefing request failed.");
      }

      if (!response.body) {
        throw new Error("Briefing stream returned no body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let runResponse: RunResponse | null = null;
      let streamedText = "";

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

          if (parsed.type === "status" && parsed.threadId) {
            setAgentThreadId(parsed.threadId);
          } else if (parsed.type === "delta" && typeof parsed.delta === "string" && parsed.delta.length > 0) {
            streamedText += parsed.delta;
            setStreamingAssistantText(streamedText);
          } else if (parsed.type === "result") {
            runResponse = parsed.result;
          } else if (parsed.type === "error") {
            throw new Error(parsed.error || "Briefing stream failed.");
          }
        }
      }

      if (!runResponse) {
        throw new Error("Briefing stream ended without a result.");
      }

      setAgentThreadId(runResponse.threadId);

      const assistantText = streamedText.trim() || runResponse.summary?.trim() || "";
      if (assistantText.length > 0) {
        setAgentMessages((previous) => [
          ...previous,
          createLocalMessage({
            role: "assistant",
            text: assistantText,
            runId: runResponse!.runId,
            actionId: runResponse!.actionId,
          }),
        ]);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Briefing failed.";
      setRunError(message);
    } finally {
      setStreamingAssistantText("");
      setIsBriefingLoading(false);
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

  async function handleSendDraft(draftId: string) {
    if (draftConfirmId !== draftId) {
      setDraftConfirmId(draftId);
      return; // Wait for second click
    }

    setDraftSendLoadingId(draftId);

    try {
      const response = await fetch("/api/tools/gmail/drafts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(readErrorMessage(body, "Failed to send draft."));
      }

      setRecentDrafts((prev) => prev.filter((d) => d.id !== draftId));
      setDraftConfirmId(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to send draft.";
      setWorkspaceError(message);
      setDraftConfirmId(null);
    } finally {
      setDraftSendLoadingId(null);
    }
  }

  async function handleSaveProfile() {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profileDisplayName.trim() || undefined,
          role: profileRole.trim() || undefined,
          organization: profileOrganization.trim() || undefined,
          timezone: profileTimezone.trim() || undefined,
          interests: profileInterests
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          ongoingProjects: profileProjects
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          notes: profileNotes.trim() || undefined,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean }
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          body && "error" in body ? body.error : "Failed to save profile.",
        );
      }
      setProfileSaved(true);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Could not save profile.";
      setProfileError(message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSaveSlackToken() {
    setSlackSaving(true);
    setSlackError(null);
    setSlackSaved(false);

    try {
      const response = await fetch("/api/user/settings/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: slackToken }),
      });

      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string };

      if (!response.ok) {
        throw new Error(body?.error || "Failed to save Slack token.");
      }

      setSlackSaved(true);
      setSlackHasToken(Boolean(slackToken.trim()));
      setSlackToken("");
    } catch (e) {
      setSlackError(e instanceof Error ? e.message : "Could not save Slack token");
    } finally {
      setSlackSaving(false);
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
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Autonomy Mode</p>
              <p className={styles.statValue}>
                {formatTrustLevelLabel(agentTrustLevel)}
              </p>
            </article>
          </div>
          <div className={styles.trustPanel}>
            <p className={styles.statLabel}>How much Alik can do on her own</p>
            <div className={styles.trustLevelRow}>
              {AGENT_TRUST_LEVEL_OPTIONS.map((option) => {
                const isActive = option.value === agentTrustLevel;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.trustLevelButton} ${isActive ? styles.trustLevelButtonActive : ""
                      }`}
                    disabled={agentTrustSubmitting || agentTrustLoading}
                    onClick={() => void handleSetAgentTrustLevel(option.value)}
                  >
                    <span className={styles.trustLevelLabel}>{option.label}</span>
                    <span className={styles.trustLevelSummary}>{option.summary}</span>
                  </button>
                );
              })}
            </div>
            {agentTrustLoading ? (
              <p className={styles.meta}>Loading autonomy mode...</p>
            ) : null}
            {agentTrustLevelSource ? (
              <p className={styles.meta}>Source: {agentTrustLevelSource}</p>
            ) : null}
            {agentTrustMessage ? <p className={styles.meta}>{agentTrustMessage}</p> : null}
            {agentTrustError ? <p className={styles.error}>{agentTrustError}</p> : null}
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

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Tell Alik about yourself</h2>
          {profileLoading ? (
            <p className={styles.meta}>Loading profile...</p>
          ) : (
            <>
              <label className={styles.label}>
                Your name
                <input
                  className={styles.input}
                  value={profileDisplayName}
                  onChange={(e) => { setProfileDisplayName(e.target.value); setProfileSaved(false); }}
                  placeholder="e.g. Alex"
                />
              </label>
              <div className={styles.toolsGrid}>
                <label className={styles.label}>
                  Role
                  <input
                    className={styles.input}
                    value={profileRole}
                    onChange={(e) => { setProfileRole(e.target.value); setProfileSaved(false); }}
                    placeholder="e.g. Founder, Student, Engineer"
                  />
                </label>
                <label className={styles.label}>
                  Organization
                  <input
                    className={styles.input}
                    value={profileOrganization}
                    onChange={(e) => { setProfileOrganization(e.target.value); setProfileSaved(false); }}
                    placeholder="e.g. JarivIAs"
                  />
                </label>
              </div>
              <label className={styles.label}>
                Timezone
                <input
                  className={styles.input}
                  value={profileTimezone}
                  onChange={(e) => { setProfileTimezone(e.target.value); setProfileSaved(false); }}
                  placeholder="e.g. America/Toronto"
                />
              </label>
              <label className={styles.label}>
                Interests (one per line)
                <textarea
                  className={styles.textarea}
                  value={profileInterests}
                  onChange={(e) => { setProfileInterests(e.target.value); setProfileSaved(false); }}
                  placeholder={"AI\nstartups\nmusic"}
                />
              </label>
              <label className={styles.label}>
                Ongoing projects (one per line)
                <textarea
                  className={styles.textarea}
                  value={profileProjects}
                  onChange={(e) => { setProfileProjects(e.target.value); setProfileSaved(false); }}
                  placeholder={"Building JarivIAs, an agentic AI portal"}
                />
              </label>
              <label className={styles.label}>
                Anything else Alik should know
                <textarea
                  className={styles.textarea}
                  value={profileNotes}
                  onChange={(e) => { setProfileNotes(e.target.value); setProfileSaved(false); }}
                  placeholder="e.g. I prefer concise replies, don't schedule things on weekends without asking"
                />
              </label>
              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.runButton}
                  onClick={() => void handleSaveProfile()}
                  disabled={profileSaving}
                >
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
              </div>
              {profileSaved ? (
                <p className={styles.meta}>Profile saved. Alik will use this from her next run.</p>
              ) : null}
              {profileError ? <p className={styles.error}>{profileError}</p> : null}
            </>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Integrations</h2>
          <label className={styles.label}>
            Slack User Token (xoxp-...)
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                className={styles.input}
                type="password"
                value={slackToken}
                onChange={(e) => {
                  setSlackToken(e.target.value);
                  setSlackSaved(false);
                }}
                placeholder={slackChecking ? "Checking..." : slackHasToken ? "•••••••••••••••• (Connected)" : "Connect your Slack workspace"}
              />
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void handleSaveSlackToken()}
                disabled={slackSaving}
                style={{ whiteSpace: "nowrap" }}
              >
                {slackSaving ? "Saving..." : slackHasToken && !slackToken.trim() ? "Disconnect" : "Save"}
              </button>
            </div>
          </label>
          <p className={styles.meta}>
            Get a User Token from https://api.slack.com/apps. Required scopes: <code>channels:history</code>, <code>channels:read</code>, <code>groups:history</code>, <code>groups:read</code>
          </p>
          {slackSaved ? <p className={styles.meta}>Slack connected successfully. Alik can now read channels.</p> : null}
          {slackError ? <p className={styles.error}>{slackError}</p> : null}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>What Alik remembers about you</h2>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void refreshMemory()}
              disabled={memoryLoading}
            >
              {memoryLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {memoryError ? <p className={styles.error}>{memoryError}</p> : null}
          {!memoryLoading && memoryEntries.length === 0 ? (
            <p className={styles.meta}>
              Nothing saved yet. Alik will learn from your conversations automatically.
            </p>
          ) : null}
          <ul className={styles.memoryList}>
            {memoryEntries.map((entry) => (
              <li key={entry.id} className={styles.memoryEntry}>
                <p className={styles.memoryContent}>{entry.content}</p>
                <div className={styles.memoryMeta}>
                  <span className={styles.memorySource}>{entry.source}</span>
                  {entry.confidence === "medium" ? (
                    <span className={styles.memoryConfidence}>medium confidence</span>
                  ) : null}
                  <button
                    type="button"
                    className={styles.memoryDeleteButton}
                    onClick={() => void handleDeleteMemoryEntry(entry.id)}
                    disabled={memoryDeletingId === entry.id}
                    aria-label="Forget this"
                  >
                    {memoryDeletingId === entry.id ? "Removing..." : "Forget"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
                        <div className={styles.pulseItemActions}>
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
                          {pinnedContext.some((c) => c.id === (event.id ?? "")) ? (
                            <button
                              type="button"
                              className={styles.pinButtonActive}
                              onClick={() => setPinnedContext((prev) => prev.filter((c) => c.id !== event.id))}
                            >
                              Pinned ✕
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.pinButton}
                              onClick={() => setPinnedContext((prev) => [...prev, {
                                type: "calendar_event",
                                id: event.id ?? `event-${event.startIso}`,
                                title: event.summary,
                                snippet: event.description ?? undefined,
                                meta: { startIso: event.startIso, endIso: event.endIso, location: event.location },
                              }])}
                            >
                              Pin as context
                            </button>
                          )}
                        </div>
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
                    <div className={styles.pulseItemActions}>
                      <a
                        href={`https://mail.google.com/mail/u/0/#inbox/${message.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.inlineLink}
                      >
                        Open in Gmail
                      </a>
                      {pinnedContext.some((c) => c.id === message.id) ? (
                        <button
                          type="button"
                          className={styles.pinButtonActive}
                          onClick={() => setPinnedContext((prev) => prev.filter((c) => c.id !== message.id))}
                        >
                          Pinned ✕
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.pinButton}
                          onClick={() => setPinnedContext((prev) => [...prev, {
                            type: "email",
                            id: message.id,
                            title: message.subject,
                            snippet: message.snippet,
                            meta: { from: message.from },
                          }])}
                        >
                          Pin as context
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className={styles.pulseCard}>
              <h3 className={styles.cardTitle}>Recent Drafts</h3>
              {workspaceLoading ? <p className={styles.meta}>Loading drafts...</p> : null}
              {!workspaceLoading && recentDrafts.length === 0 ? (
                <p className={styles.meta}>No recent drafts to show.</p>
              ) : null}
              <ul className={styles.pulseList}>
                {recentDrafts.map((draft) => (
                  <li key={draft.id} className={styles.pulseItem}>
                    <div className={styles.pulseItemHead}>
                      <p className={styles.pulseItemTitle}>{draft.subject}</p>
                      <p className={styles.pulseItemMeta}>
                        {formatDateTime(draft.updatedAtIso)}
                      </p>
                    </div>
                    <p className={styles.pulseItemMeta}>{draft.to}</p>
                    {draft.snippet ? (
                      <p className={styles.pulseSnippet}>{draft.snippet}</p>
                    ) : null}
                    <div className={styles.pulseItemActions}>
                      <a
                        href={`https://mail.google.com/mail/u/0/#drafts/${draft.messageId ?? draft.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.inlineLink}
                      >
                        Edit in Gmail
                      </a>
                      <button
                        type="button"
                        className={draftConfirmId === draft.id ? styles.runButton : styles.secondaryButton}
                        onClick={() => void handleSendDraft(draft.id)}
                        disabled={draftSendLoadingId === draft.id}
                      >
                        {draftSendLoadingId === draft.id ? "Sending..." : draftConfirmId === draft.id ? "Confirm send?" : "Send"}
                      </button>
                    </div>
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

        <section className={chatExpanded ? `${styles.panel} ${styles.panelChatExpanded}` : styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Alik</h2>
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
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void handleRequestBriefing()}
                disabled={isBriefingLoading || isSubmittingRun}
                title={
                  preparedBriefingSummary && !preparedBriefingConsumed
                    ? `Instant briefing ready (${preparedBriefingDateKey ?? "today"})`
                    : undefined
                }
              >
                {isBriefingLoading ? "Briefing..." : "What's my day?"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setChatExpanded((v) => !v)}
              >
                {chatExpanded ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>

          <div ref={chatLogRef} className={chatExpanded ? `${styles.chatLog} ${styles.chatLogExpanded}` : styles.chatLog}>
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
                <div className={styles.chatText}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer">{children}</a>
                      ),
                    }}
                  >{message.text}</ReactMarkdown>
                </div>
              </article>
            ))}
            {isSubmittingRun && streamingAssistantText.trim().length > 0 ? (
              <article className={styles.chatMessageAssistant}>
                <p className={styles.chatRole}>Alik</p>
                <div className={styles.chatText}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer">{children}</a>
                      ),
                    }}
                  >{streamingAssistantText}</ReactMarkdown>
                </div>
              </article>
            ) : null}
            {isSubmittingRun && streamingAssistantText.trim().length === 0 ? (
              <p className={styles.meta}>Alik is thinking...</p>
            ) : null}
          </div>

          {pinnedContext.length > 0 ? (
            <div className={styles.pinnedContextBar}>
              <span className={styles.pinnedContextBarLabel}>Context:</span>
              {pinnedContext.map((item) => (
                <span key={item.id} className={styles.contextChip}>
                  {item.title ? item.title.slice(0, 40) : item.id}
                  <button
                    type="button"
                    className={styles.contextChipRemove}
                    onClick={() =>
                      setPinnedContext((prev) => prev.filter((c) => c.id !== item.id))
                    }
                    aria-label={`Remove ${item.title ?? item.id} from context`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : null}

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

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Past Conversations</h2>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void refreshThreads()}
              disabled={threadsLoading}
            >
              {threadsLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {threadsError ? <p className={styles.error}>{threadsError}</p> : null}
          {!threadsLoading && threads.length === 0 ? (
            <p className={styles.meta}>No past conversations yet.</p>
          ) : null}
          <ul className={styles.pulseList}>
            {threads.map((thread) => (
              <li key={thread.id} className={styles.pulseItem}>
                <div className={styles.pulseItemHead}>
                  <p className={styles.pulseItemTitle}>
                    {thread.lastMessageTextPreview
                      ? truncateWithEllipsis(thread.lastMessageTextPreview, 80)
                      : thread.id}
                  </p>
                  <p className={styles.pulseItemMeta}>
                    {formatDateTime(thread.lastMessageAt ?? thread.updatedAt)}
                  </p>
                </div>
                {thread.source && thread.source !== "dashboard" ? (
                  <p className={styles.pulseItemMeta}>{thread.source}</p>
                ) : null}
                <button
                  type="button"
                  className={`${styles.inlineTextButton} ${thread.id === agentThreadId ? styles.activeThreadButton : ""}`}
                  onClick={() => {
                    void refreshAgentThread(thread.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {thread.id === agentThreadId ? "Currently open" : "Open →"}
                </button>
              </li>
            ))}
          </ul>
          {threadsHasMore ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void refreshThreads(threadsCursor)}
              disabled={threadsLoading}
            >
              Load more
            </button>
          ) : null}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent Activity</h2>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void refreshActivity()}
              disabled={activityLoading}
            >
              {activityLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {activityError ? <p className={styles.error}>{activityError}</p> : null}
          {!activityLoading && activityRuns.length === 0 ? (
            <p className={styles.meta}>No runs yet. Ask Alik something to get started.</p>
          ) : null}
          <ul className={styles.pulseList}>
            {activityRuns.map((run) => (
              <li key={run.id} className={styles.pulseItem}>
                <div className={styles.pulseItemHead}>
                  <p className={styles.pulseItemTitle}>
                    {run.prompt ? truncateWithEllipsis(run.prompt, 80) : "(no prompt)"}
                  </p>
                  <p className={styles.pulseItemMeta}>{formatDateTime(run.createdAt)}</p>
                </div>
                <p className={styles.pulseItemMeta}>
                  {formatRunStatus(run.status)}
                  {run.tool ? ` · ${run.tool}` : ""}
                  {run.model ? ` · ${run.model}` : ""}
                </p>
                {run.summary && run.summary !== run.prompt ? (
                  <p className={styles.pulseSnippet}>
                    {truncateWithEllipsis(run.summary, 160)}
                  </p>
                ) : null}
                {run.threadId ? (
                  <button
                    type="button"
                    className={styles.inlineTextButton}
                    onClick={() => {
                      setAgentThreadId(run.threadId);
                      void refreshAgentThread(run.threadId!);
                    }}
                  >
                    Open thread →
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
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
