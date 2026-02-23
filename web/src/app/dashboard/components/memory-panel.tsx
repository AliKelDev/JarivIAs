import type { MemoryEntry } from "../types";
import styles from "../dashboard.module.css";

type MemoryPanelProps = {
  memoryLoading: boolean;
  memoryError: string | null;
  memoryEntries: MemoryEntry[];
  memoryDeletingId: string | null;
  onRefreshMemory: () => void;
  onDeleteMemoryEntry: (id: string) => void;
};

export function MemoryPanel({
  memoryLoading,
  memoryError,
  memoryEntries,
  memoryDeletingId,
  onRefreshMemory,
  onDeleteMemoryEntry,
}: MemoryPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>What Alik remembers about you</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRefreshMemory}
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
                onClick={() => onDeleteMemoryEntry(entry.id)}
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
  );
}
