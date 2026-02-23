import type {
  AttachedContextItem,
  RecentGmailDraftItem,
  RecentInboxDigestItem,
  UpcomingCalendarDigestItem,
} from "../types";
import styles from "../dashboard.module.css";

const CALENDAR_DESCRIPTION_PREVIEW_LIMIT = 320;

type WorkspacePulsePanelProps = {
  integrationConnected: boolean;
  integrationLoading: boolean;
  workspaceLoading: boolean;
  workspaceError: string | null;
  workspaceRefreshedAt: string | null;
  upcomingEvents: UpcomingCalendarDigestItem[];
  recentInboxMessages: RecentInboxDigestItem[];
  recentDrafts: RecentGmailDraftItem[];
  pinnedContext: AttachedContextItem[];
  expandedCalendarDescriptions: Record<string, boolean>;
  draftSendLoadingId: string | null;
  draftConfirmId: string | null;
  onRefreshWorkspace: () => void;
  onToggleCalendarDescription: (eventKey: string) => void;
  onPinCalendarEvent: (event: UpcomingCalendarDigestItem) => void;
  onPinInboxMessage: (message: RecentInboxDigestItem) => void;
  onUnpinContextById: (id: string) => void;
  onSendDraft: (draftId: string) => void;
  formatDateTime: (value: string | null | undefined) => string;
  truncateWithEllipsis: (value: string, limit: number) => string;
  buildCalendarEventKey: (event: UpcomingCalendarDigestItem) => string;
};

export function WorkspacePulsePanel({
  integrationConnected,
  integrationLoading,
  workspaceLoading,
  workspaceError,
  workspaceRefreshedAt,
  upcomingEvents,
  recentInboxMessages,
  recentDrafts,
  pinnedContext,
  expandedCalendarDescriptions,
  draftSendLoadingId,
  draftConfirmId,
  onRefreshWorkspace,
  onToggleCalendarDescription,
  onPinCalendarEvent,
  onPinInboxMessage,
  onUnpinContextById,
  onSendDraft,
  formatDateTime,
  truncateWithEllipsis,
  buildCalendarEventKey,
}: WorkspacePulsePanelProps) {
  return (
    <section className={`${styles.panel} ${styles.pulsePanel}`}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Workspace Pulse</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRefreshWorkspace}
          disabled={workspaceLoading || integrationLoading || !integrationConnected}
        >
          {workspaceLoading ? "Refreshing..." : "Refresh pulse"}
        </button>
      </div>
      {!integrationConnected ? (
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
                          onClick={() => onUnpinContextById(event.id ?? "")}
                        >
                          Pinned ✕
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.pinButton}
                          onClick={() => onPinCalendarEvent(event)}
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
                          onClick={() => onToggleCalendarDescription(eventKey)}
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
                      onClick={() => onUnpinContextById(message.id)}
                    >
                      Pinned ✕
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.pinButton}
                      onClick={() => onPinInboxMessage(message)}
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
                    className={
                      draftConfirmId === draft.id
                        ? styles.runButton
                        : styles.secondaryButton
                    }
                    onClick={() => onSendDraft(draft.id)}
                    disabled={draftSendLoadingId === draft.id}
                  >
                    {draftSendLoadingId === draft.id
                      ? "Sending..."
                      : draftConfirmId === draft.id
                      ? "Confirm send?"
                      : "Send"}
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
  );
}
