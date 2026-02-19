import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";

function readRequiredPublicEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getFirebaseClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({
    apiKey: readRequiredPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: readRequiredPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: readRequiredPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    appId: readRequiredPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
    messagingSenderId: readRequiredPublicEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    storageBucket: readRequiredPublicEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  });
}
