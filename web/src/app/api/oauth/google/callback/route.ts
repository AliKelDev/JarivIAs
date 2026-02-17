import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserFromRequest } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/http/origin";
import { saveGoogleTokens } from "@/lib/google/integration";
import { createGoogleOAuthClient } from "@/lib/google/oauth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "google_oauth_state";
const OAUTH_RETURN_COOKIE = "google_oauth_return_to";

function buildRedirectUrl(origin: string, returnTo: string, error?: string): URL {
  const redirectUrl = new URL(returnTo, origin);
  if (error) {
    redirectUrl.searchParams.set("oauth_error", error);
  }
  return redirectUrl;
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const user = await getSessionUserFromRequest(request);
  const returnTo = request.cookies.get(OAUTH_RETURN_COOKIE)?.value || "/dashboard";
  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  const redirectOnFail = NextResponse.redirect(
    buildRedirectUrl(
      origin,
      returnTo,
      user ? "oauth_callback_failed" : "not_authenticated",
    ),
  );
  redirectOnFail.cookies.delete(OAUTH_STATE_COOKIE);
  redirectOnFail.cookies.delete(OAUTH_RETURN_COOKIE);

  if (!user) {
    return redirectOnFail;
  }

  const queryState = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (oauthError) {
    const redirectWithOAuthError = NextResponse.redirect(
      buildRedirectUrl(origin, returnTo, oauthError),
    );
    redirectWithOAuthError.cookies.delete(OAUTH_STATE_COOKIE);
    redirectWithOAuthError.cookies.delete(OAUTH_RETURN_COOKIE);
    return redirectWithOAuthError;
  }

  if (!code || !queryState || !stateCookie || queryState !== stateCookie) {
    return redirectOnFail;
  }

  try {
    const oauthClient = createGoogleOAuthClient(origin);
    const tokenResponse = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokenResponse.tokens);

    const oauth2Api = google.oauth2({ version: "v2", auth: oauthClient });
    const profile = await oauth2Api.userinfo.get();

    await saveGoogleTokens({
      uid: user.uid,
      accountEmail: profile.data.email ?? null,
      credentials: oauthClient.credentials,
    });

    const successRedirect = NextResponse.redirect(
      buildRedirectUrl(origin, returnTo),
    );
    successRedirect.cookies.delete(OAUTH_STATE_COOKIE);
    successRedirect.cookies.delete(OAUTH_RETURN_COOKIE);
    return successRedirect;
  } catch {
    return redirectOnFail;
  }
}
