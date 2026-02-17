import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "@/lib/auth/session";

export const runtime = "nodejs";

const MAX_AUTH_AGE_SECONDS = 5 * 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const idToken =
    body && typeof body.idToken === "string" ? body.idToken : undefined;

  if (!idToken) {
    return NextResponse.json(
      { error: "Missing idToken in request body." },
      { status: 400 },
    );
  }

  try {
    const auth = getFirebaseAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const now = Math.floor(Date.now() / 1000);

    if (now - decodedToken.auth_time > MAX_AUTH_AGE_SECONDS) {
      return NextResponse.json(
        { error: "Please sign in again to start a secure session." },
        { status: 401 },
      );
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
    });

    return response;
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to create session cookie.";

    // Keep detailed diagnostics local-only so production responses stay minimal.
    if (process.env.NODE_ENV !== "production") {
      console.error("Session login failed:", caughtError);
    }

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV !== "production"
            ? `Unable to create session cookie. ${message}`
            : "Unable to create session cookie.",
      },
      { status: 401 },
    );
  }
}
