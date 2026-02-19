import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import type { UserProfile } from "./types";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const doc = await getFirebaseAdminDb().collection("users").doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data?.profile) return null;
  return data.profile as UserProfile;
}

export async function setUserProfile(
  uid: string,
  profile: Partial<UserProfile>,
): Promise<void> {
  await getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .set({ profile, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
