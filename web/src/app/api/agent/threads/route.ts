import { NextRequest, NextResponse } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type StoredThreadSummary = {
  uid?: string;
  source?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastMessageAt?: Timestamp;
  lastMessageRole?: string;
  lastMessageTextPreview?: string;
};

function toIso(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    if (date instanceof Date) {
      return date.toISOString();
    }
  }
  return null;
}

function parseLimit(rawValue: string | null): number {
  if (!rawValue) {
    return 20;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.min(Math.max(parsed, 1), 50);
}

function normalizeLastRole(value: unknown): "user" | "assistant" | null {
  if (value === "assistant" || value === "user") {
    return value;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = request.nextUrl.searchParams.get("cursor")?.trim() ?? "";
  const db = getFirebaseAdminDb();

  try {
    let query = db
      .collection("threads")
      .where("uid", "==", user.uid)
      .orderBy("updatedAt", "desc")
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await db.collection("threads").doc(cursor).get();
      if (!cursorDoc.exists) {
        return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
      }

      const cursorData = cursorDoc.data() as StoredThreadSummary;
      if (!cursorData.uid || cursorData.uid !== user.uid) {
        return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
      }

      if (!toIso(cursorData.updatedAt)) {
        return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
      }

      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    const threads = docs.map((doc) => {
      const data = doc.data() as StoredThreadSummary;
      return {
        id: doc.id,
        source: typeof data.source === "string" ? data.source : "dashboard",
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
        lastMessageAt: toIso(data.lastMessageAt),
        lastMessageRole: normalizeLastRole(data.lastMessageRole),
        lastMessageTextPreview:
          typeof data.lastMessageTextPreview === "string"
            ? data.lastMessageTextPreview
            : "",
      };
    });

    return NextResponse.json({
      ok: true,
      threads,
      hasMore,
      nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : null,
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Threads load failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
