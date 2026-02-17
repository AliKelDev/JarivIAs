import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const response = NextResponse.json({ ok: true });

  if (sessionCookie) {
    try {
      const auth = getFirebaseAdminAuth();
      const decodedToken = await auth.verifySessionCookie(sessionCookie, true);
      await auth.revokeRefreshTokens(decodedToken.uid);
    } catch {
      // Always clear the cookie even if token verification fails.
    }
  }

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
