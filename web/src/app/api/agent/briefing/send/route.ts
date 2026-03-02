import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { getRequestOrigin } from "@/lib/http/origin";
import { getUserProfile } from "@/lib/memory";
import { sendGmailMessageForUser } from "@/lib/tools/gmail";

export const runtime = "nodejs";

function normalizeTimeZone(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "UTC";
  }
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

function dateKeyForTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.email) {
    return NextResponse.json({ error: "No email address on account." }, { status: 400 });
  }

  const origin = getRequestOrigin(request);
  const profile = await getUserProfile(user.uid);
  const timezone = normalizeTimeZone(profile?.timezone);
  const dateKey = dateKeyForTimeZone(timezone);

  const ref = getFirebaseAdminDb()
    .collection("users")
    .doc(user.uid)
    .collection("briefings")
    .doc("daily")
    .collection("entries")
    .doc(dateKey);

  const snapshot = await ref.get();
  if (!snapshot.exists) {
    return NextResponse.json(
      { error: "No briefing found for today. Try preparing one first." },
      { status: 404 },
    );
  }

  const data = snapshot.data() as { summary?: unknown };
  const summary =
    typeof data.summary === "string" && data.summary.trim()
      ? data.summary.trim()
      : null;

  if (!summary) {
    return NextResponse.json({ error: "Today's briefing is empty." }, { status: 404 });
  }

  try {
    await sendGmailMessageForUser({
      uid: user.uid,
      origin,
      to: user.email,
      subject: `Your Alik briefing — ${dateKey}`,
      bodyText: summary,
      auditType: "briefing_email_send",
      auditMeta: { dateKey, timezone },
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Failed to send briefing email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, to: user.email, dateKey });
}
