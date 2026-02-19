import { google } from "googleapis";

export const DEFAULT_GOOGLE_OAUTH_CLIENT_ID =
  "56837497601-i82if79g6q92qcsrmuhh5a17u4n3b7cn.apps.googleusercontent.com";

export const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

function readGoogleClientId(): string {
  return (
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID ||
    DEFAULT_GOOGLE_OAUTH_CLIENT_ID
  );
}

function readGoogleClientSecret(): string {
  const value = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!value) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET.");
  }
  return value;
}

export function buildGoogleRedirectUri(origin: string): string {
  return `${origin}/api/oauth/google/callback`;
}

export function createGoogleOAuthClient(origin: string) {
  return new google.auth.OAuth2(
    readGoogleClientId(),
    readGoogleClientSecret(),
    buildGoogleRedirectUri(origin),
  );
}

export function createGoogleAuthUrl(origin: string, state: string): string {
  const oauthClient = createGoogleOAuthClient(origin);
  return oauthClient.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent",
    scope: [...GOOGLE_WORKSPACE_SCOPES],
    state,
  });
}
