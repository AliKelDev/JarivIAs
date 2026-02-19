import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { getRecentMemoryEntries } from "@/lib/memory";

export const runtime = "nodejs";

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.min(Math.max(parsed, 1), 100);
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  try {
    const entries = await getRecentMemoryEntries(user.uid, limit);
    return NextResponse.json({ ok: true, entries });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to load memory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Memory entry id is required." }, { status: 400 });
  }

  try {
    await getFirebaseAdminDb()
      .collection("users")
      .doc(user.uid)
      .collection("memory")
      .doc(id)
      .delete();

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to delete memory entry.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
