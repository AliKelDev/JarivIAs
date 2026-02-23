import type { ActivityRun } from "../types";
import styles from "../dashboard.module.css";

type RunStatusBadge = {
  label: string;
  variant: "done" | "pending" | "failed";
};

type RecentActivityPanelProps = {
  activityRuns: ActivityRun[];
  activityLoading: boolean;
  activityError: string | null;
  agentThreadOpeningId: string | null;
  onRefresh: () => void;
  onOpenThread: (threadId: string) => void;
  formatDateTime: (value: string | null | undefined) => string;
  truncateWithEllipsis: (value: string, limit: number) => string;
  getRunStatusBadge: (status: string) => RunStatusBadge;
};

export function RecentActivityPanel({
  activityRuns,
  activityLoading,
  activityError,
  agentThreadOpeningId,
  onRefresh,
  onOpenThread,
  formatDateTime,
  truncateWithEllipsis,
  getRunStatusBadge,
}: RecentActivityPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Recent Activity</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRefresh}
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
            <div className={styles.activityMeta}>
              {(() => {
                const badge = getRunStatusBadge(run.status);
                const badgeClass =
                  badge.variant === "done"
                    ? `${styles.statusBadge} ${styles.statusBadgeDone}`
                    : badge.variant === "failed"
                    ? `${styles.statusBadge} ${styles.statusBadgeFailed}`
                    : `${styles.statusBadge} ${styles.statusBadgePending}`;
                return <span className={badgeClass}>{badge.label}</span>;
              })()}
              {run.tool ? (
                <span className={styles.toolChip}>{run.tool}</span>
              ) : null}
              {run.model ? (
                <span className={styles.pulseItemMeta}>· {run.model}</span>
              ) : null}
            </div>
            {run.summary && run.summary !== run.prompt ? (
              <p className={styles.pulseSnippet}>
                {truncateWithEllipsis(run.summary, 160)}
              </p>
            ) : null}
            {run.threadId ? (
              <button
                type="button"
                className={styles.inlineTextButton}
                onClick={() => onOpenThread(run.threadId!)}
                disabled={agentThreadOpeningId === run.threadId}
              >
                {agentThreadOpeningId === run.threadId ? "Opening..." : "Open thread →"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
