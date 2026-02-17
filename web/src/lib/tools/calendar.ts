import { FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import {
  getGoogleOAuthClientForUser,
  hasScope,
} from "@/lib/google/integration";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

type CreateCalendarEventParams = {
  uid: string;
  origin: string;
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  timeZone?: string;
  auditType?: string;
  auditMeta?: Record<string, unknown>;
};

export function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export async function createCalendarEventForUser(
  params: CreateCalendarEventParams,
) {
  const {
    uid,
    origin,
    summary,
    description,
    location,
    startIso,
    endIso,
    timeZone,
    auditType,
    auditMeta,
  } = params;

  if (!summary || !startIso || !endIso) {
    throw new Error("summary, startIso, and endIso are required.");
  }

  if (!isIsoDate(startIso) || !isIsoDate(endIso)) {
    throw new Error("startIso and endIso must be valid ISO datetime strings.");
  }

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, CALENDAR_EVENTS_SCOPE)) {
    throw new Error("Missing required Calendar scope. Reconnect Google Workspace.");
  }

  const calendar = google.calendar({ version: "v3", auth: oauthClient });
  const insertResponse = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description: description || undefined,
      location: location || undefined,
      start: { dateTime: startIso, timeZone: timeZone || "UTC" },
      end: { dateTime: endIso, timeZone: timeZone || "UTC" },
    },
  });

  const eventId = insertResponse.data.id ?? null;
  const eventLink = insertResponse.data.htmlLink ?? null;

  await getFirebaseAdminDb().collection("audit").add({
    uid,
    type: auditType ?? "calendar_event_create",
    status: "completed",
    summary,
    eventId,
    eventLink,
    createdAt: FieldValue.serverTimestamp(),
    ...(auditMeta ?? {}),
  });

  return { eventId, eventLink };
}
