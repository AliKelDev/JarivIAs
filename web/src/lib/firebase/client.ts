import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";

const DEFAULT_PUBLIC_CONFIG = {
  apiKey: "AIzaSyBZYRNjkyvseGQVotB94GO06_uoZSM0soU",
  authDomain: "jariv-agentic-portal-26-148.firebaseapp.com",
  projectId: "jariv-agentic-portal-26-148",
  appId: "1:56837497601:web:233e8dbdae86e7231c7100",
  messagingSenderId: "56837497601",
  storageBucket: "jariv-agentic-portal-26-148.firebasestorage.app",
};

function readPublicValue(envValue: string | undefined, fallback: string): string {
  return envValue && envValue.trim().length > 0 ? envValue : fallback;
}

export function getFirebaseClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp({
    apiKey: readPublicValue(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      DEFAULT_PUBLIC_CONFIG.apiKey,
    ),
    authDomain: readPublicValue(
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      DEFAULT_PUBLIC_CONFIG.authDomain,
    ),
    projectId: readPublicValue(
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      DEFAULT_PUBLIC_CONFIG.projectId,
    ),
    appId: readPublicValue(
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      DEFAULT_PUBLIC_CONFIG.appId,
    ),
    messagingSenderId: readPublicValue(
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      DEFAULT_PUBLIC_CONFIG.messagingSenderId,
    ),
    storageBucket: readPublicValue(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      DEFAULT_PUBLIC_CONFIG.storageBucket,
    ),
  });
}
