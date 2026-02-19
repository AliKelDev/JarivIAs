import { FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  getGoogleOAuthClientForUser,
  hasScope,
} from "@/lib/google/integration";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_COMPOSE_SCOPE =
  "https://www.googleapis.com/auth/gmail.compose";

type SendGmailMessageParams = {
  uid: string;
  origin: string;
  to: string;
  subject: string;
  bodyText: string;
  auditType?: string;
  auditMeta?: Record<string, unknown>;
};

export type RecentGmailMessage = {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  internalDateIso: string | null;
};

export type GmailThreadReadMessage = {
  id: string;
  threadId: string | null;
  from: string;
  to: string | null;
  subject: string;
  snippet: string;
  internalDateIso: string | null;
  bodyText: string | null;
};

export type GmailThreadReadResult = {
  threadId: string;
  historyId: string | null;
  messages: GmailThreadReadMessage[];
};

type ListRecentGmailMessagesParams = {
  uid: string;
  origin: string;
  maxResults?: number;
};

type ReadGmailThreadParams = {
  uid: string;
  origin: string;
  threadId: string;
  maxMessages?: number;
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function readGmailHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  targetName: string,
): string | null {
  if (!headers?.length) {
    return null;
  }
  const target = targetName.trim().toLowerCase();
  const found = headers.find(
    (header) => header.name?.trim().toLowerCase() === target,
  );
  const value = found?.value?.trim();
  return value || null;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = `${normalized}${"=".repeat(padding)}`;
  return Buffer.from(padded, "base64").toString("utf8");
}

function normalizeTextContent(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function extractMessageBodyText(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string | null {
  if (!payload) {
    return null;
  }

  const mimeType = payload.mimeType?.toLowerCase() ?? "";
  const bodyData = payload.body?.data;
  if (mimeType === "text/plain" && bodyData) {
    try {
      return normalizeTextContent(decodeBase64Url(bodyData));
    } catch {
      return null;
    }
  }

  if (payload.parts?.length) {
    for (const part of payload.parts) {
      const extracted = extractMessageBodyText(part);
      if (extracted) {
        return extracted;
      }
    }
  }

  if (bodyData) {
    try {
      return normalizeTextContent(decodeBase64Url(bodyData));
    } catch {
      return null;
    }
  }

  return null;
}

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function recipientDocId(email: string): string {
  return encodeBase64Url(normalizeEmailAddress(email));
}

export async function isRecipientAlwaysAllowed(params: {
  uid: string;
  email: string;
}): Promise<boolean> {
  const { uid, email } = params;
  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("gmailRecipientAllowlist")
    .doc(recipientDocId(email))
    .get();

  return snapshot.exists;
}

export async function setRecipientAlwaysAllowed(params: {
  uid: string;
  email: string;
}) {
  const { uid, email } = params;
  const normalizedEmail = normalizeEmailAddress(email);
  await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("gmailRecipientAllowlist")
    .doc(recipientDocId(normalizedEmail))
    .set(
      {
        email: normalizedEmail,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function sendGmailMessageForUser(params: SendGmailMessageParams) {
  const { uid, origin, to, subject, bodyText, auditType, auditMeta } = params;
  const normalizedTo = normalizeEmailAddress(to);

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, GMAIL_SEND_SCOPE)) {
    throw new Error("Missing required Gmail scope. Reconnect Google Workspace.");
  }

  const rawMessage = [
    `To: ${normalizedTo}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    bodyText,
  ].join("\r\n");

  const gmail = google.gmail({ version: "v1", auth: oauthClient });
  const sendResponse = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeBase64Url(rawMessage) },
  });

  const messageId = sendResponse.data.id ?? null;
  const threadId = sendResponse.data.threadId ?? null;

  await getFirebaseAdminDb().collection("audit").add({
    uid,
    type: auditType ?? "gmail_send",
    status: "completed",
    to: normalizedTo,
    subject,
    messageId,
    threadId,
    createdAt: FieldValue.serverTimestamp(),
    ...(auditMeta ?? {}),
  });

  return { messageId, threadId };
}

export async function listRecentGmailMessagesForUser(
  params: ListRecentGmailMessagesParams,
): Promise<RecentGmailMessage[]> {
  const { uid, origin } = params;
  const maxResults = Math.min(Math.max(params.maxResults ?? 8, 1), 20);

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, GMAIL_READONLY_SCOPE)) {
    throw new Error("Missing required Gmail read scope. Reconnect Google Workspace.");
  }

  const gmail = google.gmail({ version: "v1", auth: oauthClient });
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    includeSpamTrash: false,
    labelIds: ["INBOX"],
  });

  const messageRefs = listResponse.data.messages ?? [];
  if (messageRefs.length === 0) {
    return [];
  }

  const messages = await Promise.all(
    messageRefs.map(async (messageRef) => {
      if (!messageRef.id) {
        return null;
      }
      const details = await gmail.users.messages.get({
        userId: "me",
        id: messageRef.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = details.data.payload?.headers;
      const internalDateMs = Number(details.data.internalDate);
      return {
        id: details.data.id ?? messageRef.id,
        threadId: details.data.threadId ?? null,
        from: readGmailHeader(headers, "From") ?? "(Unknown sender)",
        subject: readGmailHeader(headers, "Subject") ?? "(No subject)",
        snippet: details.data.snippet?.trim() || "",
        internalDateIso: Number.isFinite(internalDateMs)
          ? new Date(internalDateMs).toISOString()
          : null,
      } satisfies RecentGmailMessage;
    }),
  );

  return messages.filter((message): message is RecentGmailMessage => Boolean(message));
}

export async function readGmailThreadForUser(
  params: ReadGmailThreadParams,
): Promise<GmailThreadReadResult> {
  const { uid, origin, threadId } = params;
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required.");
  }
  const maxMessages = Math.min(Math.max(params.maxMessages ?? 5, 1), 10);

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, GMAIL_READONLY_SCOPE)) {
    throw new Error("Missing required Gmail read scope. Reconnect Google Workspace.");
  }

  const gmail = google.gmail({ version: "v1", auth: oauthClient });
  const threadResponse = await gmail.users.threads.get({
    userId: "me",
    id: normalizedThreadId,
    format: "full",
  });

  const threadMessages = (threadResponse.data.messages ?? []).slice(0, maxMessages);
  const messages = threadMessages.map((message) => {
    const headers = message.payload?.headers;
    const internalDateMs = Number(message.internalDate);
    const bodyText = extractMessageBodyText(message.payload);

    return {
      id: message.id ?? "",
      threadId: message.threadId ?? null,
      from: readGmailHeader(headers, "From") ?? "(Unknown sender)",
      to: readGmailHeader(headers, "To"),
      subject: readGmailHeader(headers, "Subject") ?? "(No subject)",
      snippet: message.snippet?.trim() || "",
      internalDateIso: Number.isFinite(internalDateMs)
        ? new Date(internalDateMs).toISOString()
        : null,
      bodyText,
    } satisfies GmailThreadReadMessage;
  });

  return {
    threadId: threadResponse.data.id ?? normalizedThreadId,
    historyId: threadResponse.data.historyId ?? null,
    messages,
  };
}

type CreateGmailDraftParams = {
  uid: string;
  origin: string;
  to: string;
  subject: string;
  bodyText: string;
};

export async function createGmailDraftForUser(
  params: CreateGmailDraftParams,
): Promise<{ draftId: string; gmailLink: string }> {
  const { uid, origin, to, subject, bodyText } = params;
  const normalizedTo = normalizeEmailAddress(to);

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, GMAIL_COMPOSE_SCOPE)) {
    throw new Error("Missing required Gmail compose scope. Reconnect Google Workspace.");
  }

  const rawMessage = [
    `To: ${normalizedTo}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    bodyText,
  ].join("\r\n");

  const gmail = google.gmail({ version: "v1", auth: oauthClient });
  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: encodeBase64Url(rawMessage) },
    },
  });

  const draftId = response.data.id ?? "";
  return {
    draftId,
    gmailLink: `https://mail.google.com/mail/#drafts/${draftId}`,
  };
}
