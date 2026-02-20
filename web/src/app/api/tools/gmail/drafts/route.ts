import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { listGmailDraftsForUser } from "@/lib/tools/gmail";
import { getRequestOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";

function readLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 10;
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
    const drafts = await listGmailDraftsForUser({
      uid: user.uid,
      origin,
      maxResults: limit,
    });

    return NextResponse.json({ ok: true, drafts });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Failed to load Gmail drafts.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
