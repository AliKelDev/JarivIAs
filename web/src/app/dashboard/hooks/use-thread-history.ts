import { useCallback, useState } from "react";
import type { ThreadSummary } from "../types";

type ThreadsResponse =
  | { ok: boolean; threads: ThreadSummary[]; hasMore: boolean; nextCursor: string | null }
  | { error?: string }
  | null;

export function useThreadHistory() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [threadsHasMore, setThreadsHasMore] = useState(false);
  const [threadsCursor, setThreadsCursor] = useState<string | null>(null);

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
      const body = (await response.json().catch(() => null)) as ThreadsResponse;
      if (!response.ok) {
        throw new Error(
          body && "error" in body ? body.error : "Failed to load threads.",
        );
      }
      const data = body as {
        ok: boolean;
        threads: ThreadSummary[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      setThreads((prev) => (cursor ? [...prev, ...data.threads] : data.threads));
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

  return {
    threads,
    threadsLoading,
    threadsError,
    threadsHasMore,
    threadsCursor,
    refreshThreads,
  };
}
