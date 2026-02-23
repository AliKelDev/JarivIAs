import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const doc = await getFirebaseAdminDb()
      .collection("users")
      .doc(user.uid)
      .collection("settings")
      .doc("slack")
      .get();

    const data = doc.data();
    return NextResponse.json({ ok: true, hasToken: Boolean(data?.token) });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Failed to load Slack settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : null;

  try {
    const docRef = getFirebaseAdminDb()
      .collection("users")
      .doc(user.uid)
      .collection("settings")
      .doc("slack");

    if (token) {
      await docRef.set(
        { token, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } else {
      await docRef.delete();
    }

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Failed to save Slack settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
