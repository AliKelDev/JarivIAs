import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/http/origin";
import { createGoogleAuthUrl } from "@/lib/google/oauth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_RETURN_COOKIE = "google_oauth_return_to";
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function sanitizeReturnTo(rawValue: string | null): string {
  if (!rawValue || !rawValue.startsWith("/")) {
    return "/dashboard";
  }

  if (rawValue.startsWith("//")) {
    return "/dashboard";
  }

  return rawValue;
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const state = randomBytes(24).toString("hex");
  const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const authUrl = createGoogleAuthUrl(origin, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: OAUTH_RETURN_COOKIE,
    value: returnTo,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
