import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Credentials } from "google-auth-library";
import { createGoogleOAuthClient } from "@/lib/google/oauth";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export type GoogleWorkspaceIntegration = {
  provider: "google_workspace";
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiryDateMs: number | null;
  connectedAt?: Timestamp;
  updatedAt?: Timestamp;
};

export function googleIntegrationRef(uid: string) {
  return getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc("google_workspace");
}

function normalizeScopes(scopeValue: string | undefined | null): string[] {
  if (!scopeValue) {
    return [];
  }

  return scopeValue
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export async function getGoogleIntegration(
  uid: string,
): Promise<GoogleWorkspaceIntegration | null> {
  const snapshot = await googleIntegrationRef(uid).get();
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as GoogleWorkspaceIntegration;
  return data;
}

export async function saveGoogleTokens(params: {
  uid: string;
  accountEmail?: string | null;
  credentials: Credentials;
}) {
  const { uid, accountEmail, credentials } = params;
  const ref = googleIntegrationRef(uid);
  const existingSnapshot = await ref.get();
  const existing = existingSnapshot.exists
    ? (existingSnapshot.data() as GoogleWorkspaceIntegration)
    : null;

  const scopesFromToken = normalizeScopes(credentials.scope);
  const scopes =
    scopesFromToken.length > 0 ? scopesFromToken : (existing?.scopes ?? []);

  await ref.set(
    {
      provider: "google_workspace",
      connected: true,
      accountEmail: accountEmail ?? existing?.accountEmail ?? null,
      scopes,
      accessToken: credentials.access_token ?? existing?.accessToken ?? null,
      refreshToken: credentials.refresh_token ?? existing?.refreshToken ?? null,
      tokenType: credentials.token_type ?? existing?.tokenType ?? null,
      expiryDateMs: credentials.expiry_date ?? existing?.expiryDateMs ?? null,
      connectedAt: existing?.connectedAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getGoogleOAuthClientForUser(params: {
  uid: string;
  origin: string;
}) {
  const { uid, origin } = params;
  const integration = await getGoogleIntegration(uid);

  if (!integration?.connected) {
    throw new Error("Google Workspace is not connected for this account.");
  }

  if (!integration.refreshToken && !integration.accessToken) {
    throw new Error("No valid Google OAuth tokens found. Reconnect the account.");
  }

  const oauthClient = createGoogleOAuthClient(origin);
  oauthClient.setCredentials({
    access_token: integration.accessToken ?? undefined,
    refresh_token: integration.refreshToken ?? undefined,
    token_type: integration.tokenType ?? undefined,
    expiry_date: integration.expiryDateMs ?? undefined,
    scope: integration.scopes.join(" ") || undefined,
  });

  // Refreshes access token if required.
  await oauthClient.getAccessToken();

  await saveGoogleTokens({
    uid,
    credentials: oauthClient.credentials,
  });

  return { oauthClient, integration };
}

export function hasScope(integration: GoogleWorkspaceIntegration, scope: string) {
  return integration.scopes.includes(scope);
}
