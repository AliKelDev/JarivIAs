"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ActivityRun,
  AgentTrustLevel,
  BriefingPrepareResponse,
  CalendarUpcomingResponse,
  DashboardClientProps,
  GmailDraftsResponse,
  GmailPendingApproval,
  GmailRecentResponse,
  GoogleIntegrationStatus,
  MemoryEntry,
  RecentGmailDraftItem,
  RecentInboxDigestItem,
  SlackSettingsResponse,
  ToolResult,
  UpcomingCalendarDigestItem,
} from "./types";
import styles from "./dashboard.module.css";
import { DashboardHeader } from "./components/dashboard-header";
import { GoogleWorkspaceIntegrationPanel } from "./components/google-workspace-integration-panel";
import { LeftSidebar } from "./components/left-sidebar";
import { MemoryPanel } from "./components/memory-panel";
import { PastConversationsPanel } from "./components/past-conversations-panel";
import { ProfilePanel } from "./components/profile-panel";
import { RecentActivityPanel } from "./components/recent-activity-panel";
import { RightRail } from "./components/right-rail";
import { SlackIntegrationPanel } from "./components/slack-integration-panel";
import { WorkspacePulsePanel } from "./components/workspace-pulse-panel";
import { useAgentTrust } from "./hooks/use-agent-trust";
import { useChatRunner } from "./hooks/use-chat-runner";
import { useThreadHistory } from "./hooks/use-thread-history";

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



function getRunStatusBadge(status: string): { label: string; variant: "done" | "pending" | "failed" } {
  switch (status) {
    case "completed":
      return { label: "✓ done", variant: "done" };
    case "failed":
      return { label: "✗ failed", variant: "failed" };
    case "awaiting_confirmation":
      return { label: "⏳ pending", variant: "pending" };
    case "planning":
    case "executing":
      return { label: "⏳ pending", variant: "pending" };
    default:
      return { label: status, variant: "pending" };
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

export function DashboardClient({ user }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
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
    openAgentThread,
    refreshAgentPendingApproval,
    handleRunAgentStub,
    handleResolveAgentApproval,
    handleStartNewConversation,
  } = useChatRunner();

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

  const [chatExpanded, setChatExpanded] = useState(false);
  const [briefingPreparing, setBriefingPreparing] = useState(false);
  const [preparedBriefingSummary, setPreparedBriefingSummary] = useState<string | null>(null);
  const [preparedBriefingDateKey, setPreparedBriefingDateKey] = useState<string | null>(null);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const chatLogRef = useRef<HTMLDivElement>(null);

  const [activityRuns, setActivityRuns] = useState<ActivityRun[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  const {
    threads,
    threadsLoading,
    threadsError,
    threadsHasMore,
    threadsCursor,
    refreshThreads,
  } = useThreadHistory();

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

  const {
    agentTrustLevel,
    agentTrustLoading,
    agentTrustSubmitting,
    agentTrustError,
    agentTrustMessage,
    refreshAgentTrustLevel,
    setTrustLevel,
  } = useAgentTrust({ formatTrustLevelLabel });

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
    setBriefingPreparing(true);
    setBriefingDismissed(false);
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
    } catch {
      // Best-effort.
    } finally {
      setBriefingPreparing(false);
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
    setBriefingDismissed(false);
    setExpandedCalendarDescriptions({});
    setWorkspaceError(null);
    setWorkspaceRefreshedAt(null);
  }, [prepareBriefing, refreshGoogleStatus, refreshWorkspaceSnapshot]);

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
        setBriefingDismissed(false);
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
        <DashboardHeader user={user} onSignOut={() => void handleSignOut()} />
        <div className={styles.layoutShell}>
          {/* Left column — Phase B */}
          <div className={styles.leftCol}>
            <LeftSidebar
              agentOnline={integration?.connected ?? false}
              gmailCount={recentInboxMessages.length}
              calendarCount={upcomingEvents.length}
              slackConnected={slackHasToken}
              threads={threads}
              agentThreadId={agentThreadId}
              agentThreadOpeningId={agentThreadOpeningId}
              onOpenThread={(threadId) => openAgentThread(threadId, { scrollToTop: false })}
              onNewConversation={handleStartNewConversation}
              formatDateTime={formatDateTime}
              truncateWithEllipsis={truncateWithEllipsis}
            />
          </div>
          {/* Center column — all existing content lives here during Phase A */}
          <div className={styles.centerCol}>

            {integration?.connected && (briefingPreparing || (preparedBriefingSummary && !briefingDismissed)) ? (
              <section className={styles.briefingCard}>
                <div className={styles.briefingCardHeader}>
                  <span className={styles.briefingCardLabel}>
                    {preparedBriefingDateKey ?? "Today"}
                  </span>
                  {!briefingDismissed && (
                    <button
                      type="button"
                      className={styles.briefingDismiss}
                      onClick={() => setBriefingDismissed(true)}
                      aria-label="Dismiss briefing"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {briefingPreparing ? (
                  <p className={styles.briefingLoading}>Preparing your briefing…</p>
                ) : (
                  <>
                    <div className={styles.briefingText}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{preparedBriefingSummary ?? ""}</ReactMarkdown>
                    </div>
                    <div className={styles.briefingActions}>
                      {pinnedContext.some((c) => c.type === "briefing") ? (
                        <button
                          type="button"
                          className={styles.pinButtonActive}
                          onClick={() => setPinnedContext((prev) => prev.filter((c) => c.type !== "briefing"))}
                        >
                          Pinned to chat ✕
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.pinButton}
                          onClick={() => setPinnedContext((prev) => [
                            ...prev.filter((c) => c.type !== "briefing"),
                            {
                              type: "briefing",
                              id: `briefing-${preparedBriefingDateKey ?? "today"}`,
                              title: `Morning briefing (${preparedBriefingDateKey ?? "today"})`,
                              snippet: preparedBriefingSummary ?? "",
                            },
                          ])}
                        >
                          Pin to chat
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            <section className={chatExpanded ? `${styles.panel} ${styles.panelChatFill} ${styles.panelChatExpanded}` : `${styles.panel} ${styles.panelChatFill}`}>
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
                      onClick={() => openAgentThread(agentThreadId)}
                      disabled={agentThreadOpeningId === agentThreadId}
                    >
                      {agentThreadOpeningId === agentThreadId ? "Refreshing..." : "Refresh thread"}
                    </button>
                  ) : null}
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
                {isSubmittingRun && thinkingSteps.length > 0 ? (
                  <div className={styles.actionCard}>
                    {thinkingSteps.map((step, i) => (
                      <div key={i} className={styles.actionCardRow}>
                        <span className={styles.actionCardIcon}>→</span>
                        <span className={styles.actionCardText}>{step.toolName}</span>
                        {step.preview ? (
                          <span className={styles.actionCardPreview}>{step.preview}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {isSubmittingRun && streamingAssistantText.trim().length > 0 ? (
                  <article className={`${styles.chatMessageAssistant} ${styles.streamingMessage}`}>
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
                  <p className={styles.meta}>
                    {thinkingSteps.length > 0 ? "Waiting for response..." : "Alik is thinking..."}
                  </p>
                ) : null}
              </div>

              {thoughtText.length > 0 ? (
                <div className={styles.thoughtBlock}>
                  <button
                    type="button"
                    className={styles.thoughtToggle}
                    onClick={() => setThoughtExpanded((v) => !v)}
                  >
                    <span className={styles.thoughtToggleIcon}>{thoughtExpanded ? "▾" : "▸"}</span>
                    {isSubmittingRun ? "Thinking…" : "Thought process"}
                  </button>
                  {thoughtExpanded ? (
                    <div className={styles.thoughtText}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{thoughtText}</ReactMarkdown>
                    </div>
                  ) : null}
                </div>
              ) : null}

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
                <div className={styles.approvalCardInline}>
                  <p className={styles.approvalCardTitle}>
                    Proposed action: {agentPendingApproval.tool}
                  </p>
                  {agentPendingApproval.reason ? (
                    <p className={styles.approvalCardBody}>{agentPendingApproval.reason}</p>
                  ) : null}
                  {agentPendingApproval.preview ? (
                    <pre className={styles.approvalCardPreview}>{agentPendingApproval.preview}</pre>
                  ) : null}
                  <label className={styles.label}>
                    If rejecting, what should change? (optional)
                    <textarea
                      className={styles.textarea}
                      value={agentApprovalFeedback}
                      onChange={(event) => setAgentApprovalFeedback(event.target.value)}
                      placeholder="e.g., adjust recipient/date/content..."
                    />
                  </label>
                  <div className={styles.approvalCardActions}>
                    <button
                      type="button"
                      className={styles.approvalRejectButton}
                      onClick={() => void handleResolveAgentApproval("reject")}
                      disabled={agentApprovalSubmitting}
                    >
                      {agentApprovalSubmitting ? "Working..." : "Reject"}
                    </button>
                    <button
                      type="button"
                      className={styles.approvalApproveButton}
                      onClick={() => void handleResolveAgentApproval("approve_once")}
                      disabled={agentApprovalSubmitting}
                    >
                      {agentApprovalSubmitting ? "Working..." : "Approve"}
                    </button>
                    {agentPendingApproval.tool === "gmail_send" ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => void handleResolveAgentApproval("approve_and_always_allow_recipient")}
                        disabled={agentApprovalSubmitting}
                      >
                        {agentApprovalSubmitting ? "Working..." : "Always allow for this recipient"}
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
              <div className={styles.trustPanel}>
                <p className={styles.statLabel}>How much Alik can do on her own</p>
                <div className={styles.trustLevelRow}>
                  {AGENT_TRUST_LEVEL_OPTIONS.map((option) => {
                    const isActive = option.value === agentTrustLevel;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.trustLevelButton} ${isActive ? styles.trustLevelButtonActive : ""}`}
                        disabled={agentTrustSubmitting || agentTrustLoading}
                        onClick={() => void setTrustLevel(option.value)}
                      >
                        <span className={styles.trustLevelLabel}>{option.label}</span>
                        <span className={styles.trustLevelSummary}>{option.summary}</span>
                      </button>
                    );
                  })}
                </div>
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

            <GoogleWorkspaceIntegrationPanel
              integrationLoading={integrationLoading}
              workspaceLoading={workspaceLoading}
              integrationError={integrationError}
              integration={integration}
              pulseReady={pulseReady}
              onRefreshWorkspace={() => void handleRefreshWorkspace()}
              formatScopeLabel={formatScopeLabel}
            />

            <ProfilePanel
              profileLoading={profileLoading}
              profileDisplayName={profileDisplayName}
              profileRole={profileRole}
              profileOrganization={profileOrganization}
              profileTimezone={profileTimezone}
              profileInterests={profileInterests}
              profileProjects={profileProjects}
              profileNotes={profileNotes}
              profileSaving={profileSaving}
              profileSaved={profileSaved}
              profileError={profileError}
              onChangeDisplayName={(value) => {
                setProfileDisplayName(value);
                setProfileSaved(false);
              }}
              onChangeRole={(value) => {
                setProfileRole(value);
                setProfileSaved(false);
              }}
              onChangeOrganization={(value) => {
                setProfileOrganization(value);
                setProfileSaved(false);
              }}
              onChangeTimezone={(value) => {
                setProfileTimezone(value);
                setProfileSaved(false);
              }}
              onChangeInterests={(value) => {
                setProfileInterests(value);
                setProfileSaved(false);
              }}
              onChangeProjects={(value) => {
                setProfileProjects(value);
                setProfileSaved(false);
              }}
              onChangeNotes={(value) => {
                setProfileNotes(value);
                setProfileSaved(false);
              }}
              onSaveProfile={() => void handleSaveProfile()}
            />

            <SlackIntegrationPanel
              slackToken={slackToken}
              slackHasToken={slackHasToken}
              slackChecking={slackChecking}
              slackSaving={slackSaving}
              slackSaved={slackSaved}
              slackError={slackError}
              onChangeSlackToken={(value) => {
                setSlackToken(value);
                setSlackSaved(false);
              }}
              onSaveSlackToken={() => void handleSaveSlackToken()}
            />

            <MemoryPanel
              memoryLoading={memoryLoading}
              memoryError={memoryError}
              memoryEntries={memoryEntries}
              memoryDeletingId={memoryDeletingId}
              onRefreshMemory={() => void refreshMemory()}
              onDeleteMemoryEntry={(id) => void handleDeleteMemoryEntry(id)}
            />

            <WorkspacePulsePanel
              integrationConnected={Boolean(integration?.connected)}
              integrationLoading={integrationLoading}
              workspaceLoading={workspaceLoading}
              workspaceError={workspaceError}
              workspaceRefreshedAt={workspaceRefreshedAt}
              upcomingEvents={upcomingEvents}
              recentInboxMessages={recentInboxMessages}
              recentDrafts={recentDrafts}
              pinnedContext={pinnedContext}
              expandedCalendarDescriptions={expandedCalendarDescriptions}
              draftSendLoadingId={draftSendLoadingId}
              draftConfirmId={draftConfirmId}
              onRefreshWorkspace={() => void handleRefreshWorkspace()}
              onToggleCalendarDescription={(eventKey) =>
                setExpandedCalendarDescriptions((previous) => ({
                  ...previous,
                  [eventKey]: !previous[eventKey],
                }))
              }
              onPinCalendarEvent={(event) =>
                setPinnedContext((prev) => [
                  ...prev,
                  {
                    type: "calendar_event",
                    id: event.id ?? `event-${event.startIso}`,
                    title: event.summary,
                    snippet: event.description ?? undefined,
                    meta: {
                      startIso: event.startIso,
                      endIso: event.endIso,
                      location: event.location,
                    },
                  },
                ])
              }
              onPinInboxMessage={(message) =>
                setPinnedContext((prev) => [
                  ...prev,
                  {
                    type: "email",
                    id: message.id,
                    title: message.subject,
                    snippet: message.snippet,
                    meta: { from: message.from },
                  },
                ])
              }
              onUnpinContextById={(id) =>
                setPinnedContext((prev) => prev.filter((context) => context.id !== id))
              }
              onSendDraft={(draftId) => void handleSendDraft(draftId)}
              formatDateTime={formatDateTime}
              truncateWithEllipsis={truncateWithEllipsis}
              buildCalendarEventKey={buildCalendarEventKey}
            />

            <PastConversationsPanel
              threads={threads}
              threadsLoading={threadsLoading}
              threadsError={threadsError}
              threadsHasMore={threadsHasMore}
              agentThreadId={agentThreadId}
              agentThreadOpeningId={agentThreadOpeningId}
              onRefresh={() => void refreshThreads()}
              onLoadMore={() => void refreshThreads(threadsCursor)}
              onOpenThread={(threadId) => openAgentThread(threadId, { scrollToTop: true })}
              formatDateTime={formatDateTime}
              truncateWithEllipsis={truncateWithEllipsis}
            />

            <RecentActivityPanel
              activityRuns={activityRuns}
              activityLoading={activityLoading}
              activityError={activityError}
              agentThreadOpeningId={agentThreadOpeningId}
              onRefresh={() => void refreshActivity()}
              onOpenThread={(threadId) => openAgentThread(threadId, { scrollToTop: true })}
              formatDateTime={formatDateTime}
              truncateWithEllipsis={truncateWithEllipsis}
              getRunStatusBadge={getRunStatusBadge}
            />

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

          {/* Right column — Phase D */}
          <div className={styles.rightCol}>
            <RightRail
              integrationConnected={Boolean(integration?.connected)}
              workspaceLoading={workspaceLoading}
              upcomingEvents={upcomingEvents}
              recentInboxMessages={recentInboxMessages}
              recentDrafts={recentDrafts}
              pinnedContext={pinnedContext}
              activeToolNames={isSubmittingRun ? thinkingSteps.map((s) => s.toolName) : []}
              onPin={(item) => setPinnedContext((prev) => [...prev, item])}
              onUnpin={(id) => setPinnedContext((prev) => prev.filter((c) => c.id !== id))}
              onSendDraft={async (draftId) => {
                const res = await fetch("/api/tools/gmail/drafts/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ draftId }),
                });
                if (!res.ok) {
                  const body = await res.json().catch(() => null) as { error?: string } | null;
                  throw new Error(body?.error ?? "Failed to send draft.");
                }
                void handleRefreshWorkspace();
              }}
              formatDateTime={formatDateTime}
              truncateWithEllipsis={truncateWithEllipsis}
            />
          </div>

        </div>
      </div>
    </main>
  );
}
