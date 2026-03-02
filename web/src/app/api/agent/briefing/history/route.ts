import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 14;
const MAX_LIMIT = 90;

type BriefingEntry = {
  dateKey: string;
  summary: string;
  timezone: string;
  source: string;
  generatedAtIso: string | null;
  eventCount: number;
  messageCount: number;
};

type StoredEntry = {
  summary?: unknown;
  timezone?: unknown;
  source?: unknown;
  generatedAtIso?: unknown;
  eventCount?: unknown;
  messageCount?: unknown;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const snapshot = await getFirebaseAdminDb()
    .collection("users")
    .doc(user.uid)
    .collection("briefings")
    .doc("daily")
    .collection("entries")
    .orderBy("dateKey", "desc")
    .limit(limit)
    .get();

  const entries: BriefingEntry[] = snapshot.docs
    .map((doc) => {
      const data = doc.data() as StoredEntry;
      const summary = readString(data.summary);
      if (!summary) return null;
      return {
        dateKey: doc.id,
        summary,
        timezone: readString(data.timezone) ?? "UTC",
        source: readString(data.source) ?? "on_login",
        generatedAtIso: readString(data.generatedAtIso),
        eventCount: readNumber(data.eventCount),
        messageCount: readNumber(data.messageCount),
      };
    })
    .filter((e): e is BriefingEntry => e !== null);

  return NextResponse.json({ ok: true, entries });
}
