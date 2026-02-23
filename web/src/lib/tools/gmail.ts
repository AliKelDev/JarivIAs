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

export type RecentGmailDraftItem = {
  id: string;
  messageId: string | null;
  threadId: string | null;
  to: string;
  subject: string;
  snippet: string;
  updatedAtIso: string | null;
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

type ListRecentGmailDraftsParams = {
  uid: string;
  origin: string;
  maxResults?: number;
};

type SendGmailDraftParams = {
  uid: string;
  origin: string;
  draftId: string;
  auditType?: string;
  auditMeta?: Record<string, unknown>;
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

export async function listGmailDraftsForUser(
  params: ListRecentGmailDraftsParams,
): Promise<RecentGmailDraftItem[]> {
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
  const listResponse = await gmail.users.drafts.list({
    userId: "me",
    maxResults,
  });

  const draftRefs = listResponse.data.drafts ?? [];
  if (draftRefs.length === 0) {
    return [];
  }

  const drafts = await Promise.all(
    draftRefs.map(async (draftRef) => {
      if (!draftRef.id) {
        return null;
      }

      // @ts-expect-error - metadataHeaders is missing in gapi types but valid in API
      const detailsResp = await gmail.users.drafts.get({
        userId: "me",
        id: draftRef.id,
        format: "metadata",
        metadataHeaders: ["To", "Subject", "Date"],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details = detailsResp as any;

      const message = details.data.message;
      if (!message) {
        return null;
      }

      const headers = message.payload?.headers;
      const internalDateMs = Number(message.internalDate);

      return {
        id: details.data.id ?? draftRef.id,
        messageId: message.id ?? null,
        threadId: message.threadId ?? null,
        to: readGmailHeader(headers, "To") ?? "(No recipient)",
        subject: readGmailHeader(headers, "Subject") ?? "(No subject)",
        snippet: message.snippet?.trim() || "",
        updatedAtIso: Number.isFinite(internalDateMs)
          ? new Date(internalDateMs).toISOString()
          : null,
      } satisfies RecentGmailDraftItem;
    }),
  );

  return drafts.filter((draft): draft is RecentGmailDraftItem => Boolean(draft));
}

type ReplyToGmailThreadParams = {
  uid: string;
  origin: string;
  threadId: string;
  to: string;
  bodyText: string;
};

export async function replyToGmailThreadForUser(
  params: ReplyToGmailThreadParams,
): Promise<{ messageId: string | null; threadId: string | null }> {
  const { uid, origin, threadId, to, bodyText } = params;
  const normalizedTo = normalizeEmailAddress(to);
  const normalizedThreadId = threadId.trim();

  if (!normalizedThreadId) {
    throw new Error("threadId is required to reply to a thread.");
  }
  if (!isValidEmailAddress(normalizedTo)) {
    throw new Error(`Invalid reply-to address: ${normalizedTo}`);
  }

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, GMAIL_SEND_SCOPE)) {
    throw new Error("Missing required Gmail scope. Reconnect Google Workspace.");
  }
  if (!hasScope(integration, GMAIL_READONLY_SCOPE)) {
    throw new Error("Missing required Gmail read scope. Reconnect Google Workspace.");
  }

  const gmail = google.gmail({ version: "v1", auth: oauthClient });

  // Fetch the thread to build proper reply headers
  let originalSubject = "(No subject)";
  let lastMessageId: string | null = null;
  const allMessageIds: string[] = [];

  try {
    const threadResponse = await gmail.users.threads.get({
      userId: "me",
      id: normalizedThreadId,
      format: "metadata",
      metadataHeaders: ["Subject", "Message-ID"],
    });

    const messages = threadResponse.data.messages ?? [];
    for (const message of messages) {
      const msgId = readGmailHeader(message.payload?.headers, "Message-ID");
      if (msgId) {
        allMessageIds.push(msgId);
        lastMessageId = msgId;
      }
    }

    const firstMessage = messages[0];
    const subject = readGmailHeader(firstMessage?.payload?.headers, "Subject") ?? "";
    if (subject) {
      originalSubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    }
  } catch {
    // Non-fatal — fall back to minimal headers, Gmail will still thread correctly via threadId
    originalSubject = "Re: (unknown)";
  }

  const headerLines = [
    `To: ${normalizedTo}`,
    `Subject: ${originalSubject}`,
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (lastMessageId) {
    headerLines.push(`In-Reply-To: ${lastMessageId}`);
  }
  if (allMessageIds.length > 0) {
    headerLines.push(`References: ${allMessageIds.join(" ")}`);
  }

  const rawMessage = [...headerLines, "", bodyText].join("\r\n");

  const sendResponse = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeBase64Url(rawMessage),
      threadId: normalizedThreadId,
    },
  });

  const sentMessageId = sendResponse.data.id ?? null;
  const sentThreadId = sendResponse.data.threadId ?? null;

  await getFirebaseAdminDb().collection("audit").add({
    uid,
    type: "gmail_reply",
    status: "completed",
    to: normalizedTo,
    subject: originalSubject,
    threadId: normalizedThreadId,
    messageId: sentMessageId,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { messageId: sentMessageId, threadId: sentThreadId };
}

export async function sendGmailDraftForUser(params: SendGmailDraftParams) {
  const { uid, origin, draftId, auditType, auditMeta } = params;

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, GMAIL_COMPOSE_SCOPE)) {
    throw new Error("Missing required Gmail compose scope. Reconnect Google Workspace.");
  }

  const gmail = google.gmail({ version: "v1", auth: oauthClient });

  // First, get the draft to find the recipient and subject for the audit log
  let to = "(Unknown recipient)";
  let subject = "(No subject)";
  try {
    // @ts-expect-error - metadataHeaders is missing in gapi types but valid in API
    const detailsResp = await gmail.users.drafts.get({
      userId: "me",
      id: draftId,
      format: "metadata",
      metadataHeaders: ["To", "Subject"],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const details = detailsResp as any;

    if (details.data.message?.payload?.headers) {
      to = readGmailHeader(details.data.message.payload.headers, "To") ?? to;
      subject = readGmailHeader(details.data.message.payload.headers, "Subject") ?? subject;
    }
  } catch {
    // Graceful fallback if we can't read the draft before sending
  }

  // Send the draft
  const sendResponse = await gmail.users.drafts.send({
    userId: "me",
    requestBody: {
      id: draftId,
    },
  });

  const messageId = sendResponse.data.id ?? null;
  const threadId = sendResponse.data.threadId ?? null;

  // Log to audit
  await getFirebaseAdminDb().collection("audit").add({
    uid,
    type: auditType ?? "gmail_draft_send",
    status: "completed",
    to: normalizeEmailAddress(to),
    subject,
    draftId,
    messageId,
    threadId,
    createdAt: FieldValue.serverTimestamp(),
    ...(auditMeta ?? {}),
  });

  return { messageId, threadId };
}
