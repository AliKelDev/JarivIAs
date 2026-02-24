import { FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import {
  getGoogleOAuthClientForUser,
  hasScope,
} from "@/lib/google/integration";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.readonly";

type CreateCalendarEventParams = {
  uid: string;
  origin: string;
  summary: string;
  description?: string;
  location?: string;
  startIso: string;
  endIso: string;
  timeZone?: string;
  attendees?: string[];
  auditType?: string;
  auditMeta?: Record<string, unknown>;
};

export function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export type UpcomingCalendarEvent = {
  id: string | null;
  summary: string;
  description: string | null;
  startIso: string | null;
  endIso: string | null;
  htmlLink: string | null;
  location: string | null;
};

type ListUpcomingCalendarEventsParams = {
  uid: string;
  origin: string;
  maxResults?: number;
  timeMinIso?: string;
};

function normalizeCalendarDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
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
    attendees,
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
      attendees: attendees?.map((email) => ({ email })),
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

type UpdateCalendarEventParams = {
  uid: string;
  origin: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  startIso?: string;
  endIso?: string;
  timeZone?: string;
  attendees?: string[];
  auditType?: string;
  auditMeta?: Record<string, unknown>;
};

export async function updateCalendarEventForUser(
  params: UpdateCalendarEventParams,
) {
  const { uid, origin, eventId, summary, description, location, startIso, endIso, timeZone, attendees, auditType, auditMeta } = params;

  if (!eventId) {
    throw new Error("eventId is required.");
  }

  if (startIso && !isIsoDate(startIso)) {
    throw new Error("startIso must be a valid ISO datetime string.");
  }
  if (endIso && !isIsoDate(endIso)) {
    throw new Error("endIso must be a valid ISO datetime string.");
  }

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({ uid, origin });

  if (!hasScope(integration, CALENDAR_EVENTS_SCOPE)) {
    throw new Error("Missing required Calendar scope. Reconnect Google Workspace.");
  }

  const requestBody: Record<string, unknown> = {};
  if (summary !== undefined) requestBody.summary = summary;
  if (description !== undefined) requestBody.description = description;
  if (location !== undefined) requestBody.location = location;
  if (startIso !== undefined) {
    requestBody.start = { dateTime: startIso, timeZone: timeZone ?? "UTC" };
  }
  if (endIso !== undefined) {
    requestBody.end = { dateTime: endIso, timeZone: timeZone ?? "UTC" };
  }
  if (attendees !== undefined) {
    requestBody.attendees = attendees.map((email) => ({ email }));
  }

  const calendar = google.calendar({ version: "v3", auth: oauthClient });
  const patchResponse = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody,
  });

  const updatedLink = patchResponse.data.htmlLink ?? null;

  await getFirebaseAdminDb().collection("audit").add({
    uid,
    type: auditType ?? "calendar_event_update",
    status: "completed",
    eventId,
    summary: summary ?? null,
    eventLink: updatedLink,
    createdAt: FieldValue.serverTimestamp(),
    ...(auditMeta ?? {}),
  });

  return { eventId, eventLink: updatedLink };
}

type SearchCalendarEventsParams = {
  uid: string;
  origin: string;
  query?: string;
  timeMinIso?: string;
  timeMaxIso?: string;
  maxResults?: number;
};

export async function searchCalendarEventsForUser(
  params: SearchCalendarEventsParams,
): Promise<UpcomingCalendarEvent[]> {
  const { uid, origin } = params;
  const maxResults = Math.min(Math.max(params.maxResults ?? 10, 1), 20);

  // Default time window: now → 30 days out
  const timeMin = params.timeMinIso ?? new Date().toISOString();
  const timeMax =
    params.timeMaxIso ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (!isIsoDate(timeMin)) {
    throw new Error("timeMin must be a valid ISO datetime string.");
  }
  if (!isIsoDate(timeMax)) {
    throw new Error("timeMax must be a valid ISO datetime string.");
  }

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, CALENDAR_READONLY_SCOPE)) {
    throw new Error(
      "Missing required Calendar read scope. Reconnect Google Workspace.",
    );
  }

  const calendar = google.calendar({ version: "v3", auth: oauthClient });
  const listResponse = await calendar.events.list({
    calendarId: "primary",
    singleEvents: true,
    orderBy: "startTime",
    showDeleted: false,
    timeMin,
    timeMax,
    maxResults,
    // q searches summary, description, location, and attendee names
    ...(params.query?.trim() ? { q: params.query.trim() } : {}),
  });

  return (listResponse.data.items ?? []).map((event) => ({
    id: event.id ?? null,
    summary: event.summary?.trim() || "(Untitled event)",
    description: event.description?.trim() || null,
    startIso: normalizeCalendarDate(event.start?.dateTime ?? event.start?.date),
    endIso: normalizeCalendarDate(event.end?.dateTime ?? event.end?.date),
    htmlLink: event.htmlLink ?? null,
    location: event.location?.trim() || null,
  }));
}

export async function listUpcomingCalendarEventsForUser(
  params: ListUpcomingCalendarEventsParams,
): Promise<UpcomingCalendarEvent[]> {
  const { uid, origin } = params;
  const maxResults = Math.min(Math.max(params.maxResults ?? 8, 1), 20);
  const timeMinIso = params.timeMinIso ?? new Date().toISOString();

  if (!isIsoDate(timeMinIso)) {
    throw new Error("timeMinIso must be a valid ISO datetime string.");
  }

  const { oauthClient, integration } = await getGoogleOAuthClientForUser({
    uid,
    origin,
  });

  if (!hasScope(integration, CALENDAR_READONLY_SCOPE)) {
    throw new Error(
      "Missing required Calendar read scope. Reconnect Google Workspace.",
    );
  }

  const calendar = google.calendar({ version: "v3", auth: oauthClient });
  const listResponse = await calendar.events.list({
    calendarId: "primary",
    singleEvents: true,
    orderBy: "startTime",
    showDeleted: false,
    timeMin: timeMinIso,
    maxResults,
  });

  return (listResponse.data.items ?? []).map((event) => ({
    id: event.id ?? null,
    summary: event.summary?.trim() || "(Untitled event)",
    description: event.description?.trim() || null,
    startIso: normalizeCalendarDate(event.start?.dateTime ?? event.start?.date),
    endIso: normalizeCalendarDate(event.end?.dateTime ?? event.end?.date),
    htmlLink: event.htmlLink ?? null,
    location: event.location?.trim() || null,
  }));
}
