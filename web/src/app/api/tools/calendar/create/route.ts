import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/http/origin";
import {
  createCalendarEventForUser,
  isIsoDate,
} from "@/lib/tools/calendar";

export const runtime = "nodejs";

type CreateCalendarBody = {
  summary?: string;
  description?: string;
  location?: string;
  startIso?: string;
  endIso?: string;
  timeZone?: string;
};

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
    const createResult = await createCalendarEventForUser({
      uid: user.uid,
      origin,
      summary,
      description: description || undefined,
      location: location || undefined,
      startIso,
      endIso,
      timeZone,
      auditType: "calendar_event_create",
      auditMeta: {
        source: "manual_direct_endpoint",
      },
    });

    return NextResponse.json({
      ok: true,
      eventId: createResult.eventId,
      eventLink: createResult.eventLink,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Calendar event creation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
