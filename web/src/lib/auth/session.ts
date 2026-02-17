import type { DecodedIdToken } from "firebase-admin/auth";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export const SESSION_COOKIE_NAME = "__session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export type SessionUser = Pick<
  DecodedIdToken,
  "uid" | "email" | "name" | "picture"
>;

function toSessionUser(decodedToken: DecodedIdToken): SessionUser {
  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name,
    picture: decodedToken.picture,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await getFirebaseAdminAuth().verifySessionCookie(
      sessionCookie,
      true,
    );
    return toSessionUser(decodedToken);
  } catch {
    return null;
  }
}

export async function getSessionUserFromRequest(
  request: NextRequest,
): Promise<SessionUser | null> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await getFirebaseAdminAuth().verifySessionCookie(
      sessionCookie,
      true,
    );
    return toSessionUser(decodedToken);
  } catch {
    return null;
  }
}
