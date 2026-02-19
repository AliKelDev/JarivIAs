import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { listUpcomingCalendarEventsForUser } from "@/lib/tools/calendar";
import { getRequestOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";

function readLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), 20);
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = getRequestOrigin(request);
  const limit = readLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const events = await listUpcomingCalendarEventsForUser({
      uid: user.uid,
      origin,
      maxResults: limit,
    });

    return NextResponse.json({
      ok: true,
      events,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Failed to load upcoming calendar events.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
