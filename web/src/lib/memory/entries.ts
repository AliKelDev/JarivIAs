import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import type { MemoryEntry, MemoryEntrySource } from "./types";

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

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      source: (data.source ?? "system") as MemoryEntrySource,
      threadId: data.threadId ?? undefined,
      content: data.content ?? "",
      tags: Array.isArray(data.tags) ? data.tags : undefined,
      confidence: data.confidence === "medium" ? "medium" : "high",
    } satisfies MemoryEntry;
  });
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
