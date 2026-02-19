"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseClientApp } from "@/lib/firebase/client";
import styles from "./login.module.css";

export function LoginClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError(null);

    try {
      const auth = getAuth(getFirebaseClientApp());
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const response = await fetch("/api/auth/session-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "Session login failed");
      }

      await signOut(auth);
      router.replace("/");
      router.refresh();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to sign in with Google.";
      setError(message);
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Jariv Agentic Portal</h1>
        <p className={styles.subtitle}>
          Sign in with Google to access your dashboard and run assistant actions.
        </p>
        <button
          type="button"
          className={styles.button}
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Continue with Google"}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}
