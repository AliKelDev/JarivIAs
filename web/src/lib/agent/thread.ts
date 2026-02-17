import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export type ThreadMessageRole = "user" | "assistant";

type StoredThread = {
  uid?: string;
  source?: string;
};

type StoredThreadMessage = {
  role?: string;
  text?: string;
  createdAt?: Timestamp;
  runId?: string;
  actionId?: string;
};

export type AgentThreadMessage = {
  id: string;
  role: ThreadMessageRole;
  text: string;
  createdAt: string | null;
  runId: string | null;
  actionId: string | null;
};

function toIso(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    if (date instanceof Date) {
      return date.toISOString();
    }
  }
  return null;
}

function normalizeRole(value: string | undefined): ThreadMessageRole {
  return value === "assistant" ? "assistant" : "user";
}

function threadRef(threadId: string) {
  return getFirebaseAdminDb().collection("threads").doc(threadId);
}

function threadMessagesRef(threadId: string) {
  return threadRef(threadId).collection("messages");
}

export async function ensureThreadForUser(params: {
  uid: string;
  threadId: string;
  source?: string;
}) {
  const { uid, threadId, source } = params;
  const ref = threadRef(threadId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    await ref.set({
      uid,
      source: source ?? "dashboard",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const data = snapshot.data() as StoredThread;
  if (!data.uid || data.uid !== uid) {
    throw new Error("Thread not found or does not belong to this user.");
  }

  await ref.set(
    {
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function assertThreadOwnership(params: {
  uid: string;
  threadId: string;
}) {
  const { uid, threadId } = params;
  const snapshot = await threadRef(threadId).get();
  if (!snapshot.exists) {
    throw new Error("Thread not found.");
  }
  const data = snapshot.data() as StoredThread;
  if (!data.uid || data.uid !== uid) {
    throw new Error("Thread not found or does not belong to this user.");
  }
}

export async function appendThreadMessage(params: {
  uid: string;
  threadId: string;
  role: ThreadMessageRole;
  text: string;
  runId?: string | null;
  actionId?: string | null;
  skipThreadCheck?: boolean;
}) {
  const { uid, threadId, role, text, runId, actionId, skipThreadCheck } = params;
  const trimmedText = text.trim();
  if (!trimmedText) {
    return null;
  }

  if (!skipThreadCheck) {
    await ensureThreadForUser({ uid, threadId });
  }
  const now = FieldValue.serverTimestamp();
  const messageRef = threadMessagesRef(threadId).doc();

  await messageRef.set({
    uid,
    role,
    text: trimmedText,
    runId: runId ?? null,
    actionId: actionId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await threadRef(threadId).set(
    {
      updatedAt: now,
      lastMessageRole: role,
      lastMessageTextPreview:
        trimmedText.length > 220 ? `${trimmedText.slice(0, 220)}...` : trimmedText,
      lastMessageAt: now,
    },
    { merge: true },
  );

  return messageRef.id;
}

export async function listThreadMessages(params: {
  uid: string;
  threadId: string;
  limit?: number;
  skipThreadCheck?: boolean;
}): Promise<AgentThreadMessage[]> {
  const { uid, threadId, skipThreadCheck } = params;
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  if (!skipThreadCheck) {
    await assertThreadOwnership({ uid, threadId });
  }

  const snapshot = await threadMessagesRef(threadId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as StoredThreadMessage;
      return {
        id: doc.id,
        role: normalizeRole(data.role),
        text: typeof data.text === "string" ? data.text : "",
        createdAt: toIso(data.createdAt),
        runId: typeof data.runId === "string" ? data.runId : null,
        actionId: typeof data.actionId === "string" ? data.actionId : null,
      };
    })
    .reverse();
}

export async function listThreadConversationForModel(params: {
  uid: string;
  threadId: string;
  limit?: number;
  skipThreadCheck?: boolean;
}) {
  const messages = await listThreadMessages(params);
  return messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({
      role: message.role,
      text: message.text,
    }));
}
