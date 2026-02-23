import type { ThreadSummary } from "../types";
import styles from "../dashboard.module.css";

type PastConversationsPanelProps = {
  threads: ThreadSummary[];
  threadsLoading: boolean;
  threadsError: string | null;
  threadsHasMore: boolean;
  agentThreadId: string | null;
  agentThreadOpeningId: string | null;
  onRefresh: () => void;
  onLoadMore: () => void;
  onOpenThread: (threadId: string) => void;
  formatDateTime: (value: string | null | undefined) => string;
  truncateWithEllipsis: (value: string, limit: number) => string;
};

export function PastConversationsPanel({
  threads,
  threadsLoading,
  threadsError,
  threadsHasMore,
  agentThreadId,
  agentThreadOpeningId,
  onRefresh,
  onLoadMore,
  onOpenThread,
  formatDateTime,
  truncateWithEllipsis,
}: PastConversationsPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Past Conversations</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRefresh}
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
              onClick={() => onOpenThread(thread.id)}
              disabled={agentThreadOpeningId === thread.id}
            >
              {agentThreadOpeningId === thread.id
                ? "Opening..."
                : thread.id === agentThreadId
                ? "Currently open"
                : "Open →"}
            </button>
          </li>
        ))}
      </ul>
      {threadsHasMore ? (
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onLoadMore}
          disabled={threadsLoading}
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}
