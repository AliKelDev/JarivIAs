import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";

export function getFirebaseClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const storageBucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();

  if (!apiKey)
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_FIREBASE_API_KEY",
    );
  if (!authDomain)
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    );
  if (!projectId)
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    );
  if (!appId)
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_FIREBASE_APP_ID",
    );
  if (!messagingSenderId)
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    );
  if (!storageBucket)
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    );

  return initializeApp({
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId,
    storageBucket,
  });
}
