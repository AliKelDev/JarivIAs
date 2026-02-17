"use client";

import { useEffect, useMemo, useState } from "react";
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

export function DashboardClient({ user }: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState(
    "Create a follow-up plan for this week and save the run.",
  );
  const [isSubmittingRun, setIsSubmittingRun] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [integrationLoading, setIntegrationLoading] = useState(true);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<GoogleIntegrationStatus | null>(
    null,
  );

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

  async function refreshGoogleStatus() {
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

      setIntegration(body as GoogleIntegrationStatus);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load integration status.";
      setIntegrationError(message);
    } finally {
      setIntegrationLoading(false);
    }
  }

  useEffect(() => {
    void refreshGoogleStatus();
  }, []);

  async function handleRunAgentStub() {
    setIsSubmittingRun(true);
    setRunError(null);
    setRunResult(null);

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const body = (await response.json().catch(() => null)) as
        | RunResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const message =
          body && "error" in body ? body.error : "Agent run failed.";
        throw new Error(message || "Agent run failed.");
      }

      setRunResult(body as RunResponse);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unexpected request failure.";
      setRunError(message);
    } finally {
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

  async function handleSignOut() {
    await fetch("/api/auth/session-logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.meta}>
              {user.name || user.email || user.uid} · {user.uid}
            </p>
          </div>
          <button type="button" className={styles.logoutButton} onClick={handleSignOut}>
            Sign out
          </button>
        </header>

        {oauthError ? (
          <section className={styles.panel}>
            <p className={styles.error}>
              Google OAuth returned an error: <code>{oauthError}</code>
            </p>
          </section>
        ) : null}

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Google Workspace Integration</h2>
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
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void refreshGoogleStatus()}
                >
                  Refresh status
                </button>
              </div>
              {integration?.connected && integration.scopes?.length ? (
                <pre className={styles.result}>
                  {JSON.stringify({ scopes: integration.scopes }, null, 2)}
                </pre>
              ) : null}
            </>
          ) : null}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Send Email (Gmail)</h2>
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
          <h2 className={styles.panelTitle}>Create Calendar Event</h2>
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

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Agent Stub</h2>
          <label htmlFor="prompt" className={styles.label}>
            Prompt (persists run + action in Firestore)
          </label>
          <textarea
            id="prompt"
            className={styles.textarea}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button
            type="button"
            className={styles.runButton}
            onClick={handleRunAgentStub}
            disabled={isSubmittingRun}
          >
            {isSubmittingRun ? "Running..." : "Run Agent Stub"}
          </button>
          {runError ? <p className={styles.error}>{runError}</p> : null}
          {runResult ? (
            <pre className={styles.result}>{JSON.stringify(runResult, null, 2)}</pre>
          ) : null}
        </section>
      </div>
    </main>
  );
}
