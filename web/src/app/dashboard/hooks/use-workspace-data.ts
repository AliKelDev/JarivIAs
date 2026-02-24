import { useCallback, useState } from "react";
import type {
  CalendarUpcomingResponse,
  GmailDraftsResponse,
  GmailRecentResponse,
  GoogleIntegrationStatus,
  RecentGmailDraftItem,
  RecentInboxDigestItem,
  UpcomingCalendarDigestItem,
} from "../types";

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

function buildCalendarEventKey(event: UpcomingCalendarDigestItem): string {
  return (
    event.id ??
    `${event.summary}-${event.startIso ?? "none"}-${event.endIso ?? "none"}`
  );
}

export function useWorkspaceData() {
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

  const clearWorkspaceData = useCallback(() => {
    setUpcomingEvents([]);
    setRecentInboxMessages([]);
    setRecentDrafts([]);
    setDraftConfirmId(null);
    setDraftSendLoadingId(null);
    setExpandedCalendarDescriptions({});
    setWorkspaceError(null);
    setWorkspaceRefreshedAt(null);
  }, []);

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

  const refreshWorkspaceData = useCallback(async () => {
    const status = await refreshGoogleStatus();
    if (status?.connected) {
      await refreshWorkspaceSnapshot();
      return status;
    }

    clearWorkspaceData();
    return status;
  }, [clearWorkspaceData, refreshGoogleStatus, refreshWorkspaceSnapshot]);

  const toggleCalendarDescription = useCallback((eventKey: string) => {
    setExpandedCalendarDescriptions((previous) => ({
      ...previous,
      [eventKey]: !previous[eventKey],
    }));
  }, []);

  const handleSendDraft = useCallback(
    async (draftId: string) => {
      if (draftConfirmId !== draftId) {
        setDraftConfirmId(draftId);
        return;
      }

      setDraftSendLoadingId(draftId);

      try {
        const response = await fetch("/api/tools/gmail/drafts/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(readErrorMessage(body, "Failed to send draft."));
        }

        setRecentDrafts((previous) => previous.filter((draft) => draft.id !== draftId));
        setDraftConfirmId(null);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to send draft.";
        setWorkspaceError(message);
        setDraftConfirmId(null);
      } finally {
        setDraftSendLoadingId(null);
      }
    },
    [draftConfirmId],
  );

  return {
    integrationLoading,
    integrationError,
    integration,
    workspaceLoading,
    workspaceError,
    upcomingEvents,
    recentInboxMessages,
    recentDrafts,
    workspaceRefreshedAt,
    expandedCalendarDescriptions,
    draftSendLoadingId,
    draftConfirmId,
    refreshGoogleStatus,
    refreshWorkspaceSnapshot,
    refreshWorkspaceData,
    clearWorkspaceData,
    toggleCalendarDescription,
    handleSendDraft,
  };
}
