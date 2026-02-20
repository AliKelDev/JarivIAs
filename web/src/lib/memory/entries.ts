import {
  FieldValue,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import type { MemoryEntry, MemoryEntrySource } from "./types";

function mapDocToMemoryEntry(
  doc: QueryDocumentSnapshot<DocumentData>,
): MemoryEntry {
  const data = doc.data();
  return {
    id: doc.id,
    source: (data.source ?? "system") as MemoryEntrySource,
    threadId: data.threadId ?? undefined,
    content: data.content ?? "",
    tags: Array.isArray(data.tags) ? data.tags : undefined,
    confidence: data.confidence === "medium" ? "medium" : "high",
  } satisfies MemoryEntry;
}

export async function getRecentMemoryEntries(
  uid: string,
  limit = 20,
): Promise<MemoryEntry[]> {
  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("memory")
    .orderBy("createdAt", "desc")
    .limit(Math.min(limit, 50))
    .get();

  return snapshot.docs.map(mapDocToMemoryEntry);
}

export async function searchMemoryEntries(params: {
  uid: string;
  query: string;
  limit?: number;
  scanLimit?: number;
}): Promise<MemoryEntry[]> {
  const { uid } = params;
  const normalizedQuery = params.query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const limit = Math.min(Math.max(params.limit ?? 5, 1), 20);
  const scanLimit = Math.min(Math.max(params.scanLimit ?? 100, 20), 200);
  const queryTerms = normalizedQuery
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 8);

  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("memory")
    .orderBy("createdAt", "desc")
    .limit(scanLimit)
    .get();

  const matches = snapshot.docs
    .map(mapDocToMemoryEntry)
    .filter((entry) => {
      const content = entry.content.trim().toLowerCase();
      if (!content) {
        return false;
      }

      if (content.includes(normalizedQuery)) {
        return true;
      }

      if (queryTerms.length > 1) {
        return queryTerms.every((term) => content.includes(term));
      }

      return false;
    });

  return matches.slice(0, limit);
}

export async function addMemoryEntry(
  uid: string,
  entry: Omit<MemoryEntry, "id">,
): Promise<string> {
  const ref = await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("memory")
    .add({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    });
  return ref.id;
}
