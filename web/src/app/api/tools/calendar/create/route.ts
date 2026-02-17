import { FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/http/origin";
import {
  getGoogleOAuthClientForUser,
  hasScope,
} from "@/lib/google/integration";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type CreateCalendarBody = {
  summary?: string;
  description?: string;
  location?: string;
  startIso?: string;
  endIso?: string;
  timeZone?: string;
};

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export async function POST(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | CreateCalendarBody
    | null;
  const summary = body?.summary?.trim();
  const description = body?.description?.trim();
  const location = body?.location?.trim();
  const startIso = body?.startIso?.trim();
  const endIso = body?.endIso?.trim();
  const timeZone = body?.timeZone?.trim() || "UTC";

  if (!summary || !startIso || !endIso) {
    return NextResponse.json(
      { error: "summary, startIso, and endIso are required." },
      { status: 400 },
    );
  }

  if (!isIsoDate(startIso) || !isIsoDate(endIso)) {
    return NextResponse.json(
      { error: "startIso and endIso must be valid ISO datetime strings." },
      { status: 400 },
    );
  }

  try {
    const { oauthClient, integration } = await getGoogleOAuthClientForUser({
      uid: user.uid,
      origin,
    });

    if (!hasScope(integration, "https://www.googleapis.com/auth/calendar.events")) {
      return NextResponse.json(
        { error: "Missing required Calendar scope. Reconnect Google Workspace." },
        { status: 403 },
      );
    }

    const calendar = google.calendar({ version: "v3", auth: oauthClient });
    const insertResponse = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description: description || undefined,
        location: location || undefined,
        start: { dateTime: startIso, timeZone },
        end: { dateTime: endIso, timeZone },
      },
    });

    await getFirebaseAdminDb().collection("audit").add({
      uid: user.uid,
      type: "calendar_event_create",
      status: "completed",
      summary,
      eventId: insertResponse.data.id ?? null,
      eventLink: insertResponse.data.htmlLink ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      eventId: insertResponse.data.id ?? null,
      eventLink: insertResponse.data.htmlLink ?? null,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Calendar event creation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
