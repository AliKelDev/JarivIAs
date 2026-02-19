import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getUserProfile, setUserProfile } from "@/lib/memory";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const profile = await getUserProfile(user.uid);
  return NextResponse.json({ ok: true, profile: profile ?? {} });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const allowed = [
    "displayName",
    "role",
    "organization",
    "timezone",
    "language",
    "preferredTone",
    "interests",
    "ongoingProjects",
    "importantContacts",
    "notes",
  ];

  const update = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowed.includes(key)),
  );

  await setUserProfile(user.uid, update);
  return NextResponse.json({ ok: true });
}
