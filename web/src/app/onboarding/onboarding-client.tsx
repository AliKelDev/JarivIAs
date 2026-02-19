"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./onboarding.module.css";

type AgentTrustLevel = "supervised" | "delegated" | "autonomous";

type UserProfile = {
  displayName?: string;
  role?: string;
  organization?: string;
  timezone?: string;
  notes?: string;
};

type OnboardingStatus = {
  googleConnected: boolean;
  googleAccountEmail: string | null;
  profileComplete: boolean;
  trustConfigured: boolean;
  trustLevel: AgentTrustLevel;
  trustSource: "settings" | "profile_fallback" | "default";
  isComplete: boolean;
  profile: UserProfile;
};

type OnboardingClientProps = {
  user: {
    uid: string;
    email: string | null;
    name: string | null;
  };
  initialStatus: OnboardingStatus;
};

const TRUST_OPTIONS: Array<{
  value: AgentTrustLevel;
  label: string;
  description: string;
}> = [
  {
    value: "supervised",
    label: "Supervised",
    description: "Alik asks before side-effect actions.",
  },
  {
    value: "delegated",
    label: "Delegated",
    description: "Alik can run low-risk actions and asks for risky ones.",
  },
  {
    value: "autonomous",
    label: "Autonomous",
    description: "Alik can execute with minimal interruptions.",
  },
];

function getDefaultTimezone(): string {
  if (typeof Intl === "undefined") {
    return "UTC";
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function readErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim().length > 0 ? error : fallback;
}

function buildStatusWithProfile(
  current: OnboardingStatus,
  profile: UserProfile,
): OnboardingStatus {
  const profileComplete = typeof profile.displayName === "string"
    ? profile.displayName.trim().length > 0
    : false;
  const isComplete =
    current.googleConnected && current.trustConfigured && profileComplete;

  return {
    ...current,
    profile,
    profileComplete,
    isComplete,
  };
}

function buildStatusWithTrust(
  current: OnboardingStatus,
  trustLevel: AgentTrustLevel,
): OnboardingStatus {
  const trustConfigured = true;
  const isComplete =
    current.googleConnected && current.profileComplete && trustConfigured;

  return {
    ...current,
    trustLevel,
    trustConfigured,
    trustSource: "settings",
    isComplete,
  };
}

export function OnboardingClient({ user, initialStatus }: OnboardingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("oauth_error");

  const [status, setStatus] = useState<OnboardingStatus>(initialStatus);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [trustSaving, setTrustSaving] = useState(false);
  const [trustError, setTrustError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(status.profile.displayName ?? "");
  const [role, setRole] = useState(status.profile.role ?? "");
  const [organization, setOrganization] = useState(
    status.profile.organization ?? "",
  );
  const [timezone, setTimezone] = useState(
    status.profile.timezone ?? getDefaultTimezone(),
  );
  const [notes, setNotes] = useState(status.profile.notes ?? "");

  const currentStep = useMemo(() => {
    if (!status.googleConnected) return 1;
    if (!status.profileComplete) return 2;
    if (!status.trustConfigured) return 3;
    return 3;
  }, [status.googleConnected, status.profileComplete, status.trustConfigured]);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);

    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          role: role.trim() || undefined,
          organization: organization.trim() || undefined,
          timezone: timezone.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(readErrorMessage(body, "Failed to save profile."));
      }

      const nextProfile: UserProfile = {
        displayName: displayName.trim() || undefined,
        role: role.trim() || undefined,
        organization: organization.trim() || undefined,
        timezone: timezone.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      setStatus((current) => buildStatusWithProfile(current, nextProfile));
      setProfileSaved(true);
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error ? caughtError.message : "Could not save profile.",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleTrustPick(level: AgentTrustLevel) {
    setTrustSaving(true);
    setTrustError(null);

    try {
      const response = await fetch("/api/agent/trust-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trustLevel: level }),
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(readErrorMessage(body, "Failed to update trust level."));
      }

      setStatus((current) => buildStatusWithTrust(current, level));
    } catch (caughtError) {
      setTrustError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update trust level.",
      );
    } finally {
      setTrustSaving(false);
    }
  }

  function openDashboard() {
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Alik Setup</p>
          <h1 className={styles.title}>Set up your workspace in 3 steps</h1>
          <p className={styles.subtitle}>
            Signed in as <strong>{user.email ?? user.name ?? "your account"}</strong>.
            Finish this once, then you are in the main dashboard.
          </p>
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${(currentStep / 3) * 100}%` }}
              />
            </div>
            <p className={styles.progressText}>Current step: {currentStep} / 3</p>
          </div>
        </header>

        {oauthError ? (
          <p className={styles.errorBanner}>
            Google OAuth returned an error: <code>{oauthError}</code>
          </p>
        ) : null}

        <div className={styles.grid}>
          <article className={styles.card}>
            <p className={styles.stepTag}>Step 1</p>
            <h2 className={styles.cardTitle}>Connect Google Workspace</h2>
            <p className={styles.cardBody}>
              Grant Gmail and Calendar access so Alik can read your inbox and manage
              events.
            </p>
            {status.googleConnected ? (
              <p className={styles.successText}>
                Connected{status.googleAccountEmail ? ` as ${status.googleAccountEmail}` : "."}
              </p>
            ) : (
              <p className={styles.mutedText}>Not connected yet.</p>
            )}
            <a
              className={styles.primaryButton}
              href="/api/oauth/google/start?returnTo=/onboarding"
            >
              {status.googleConnected ? "Reconnect Google" : "Connect Google"}
            </a>
          </article>

          <article className={styles.card}>
            <p className={styles.stepTag}>Step 2</p>
            <h2 className={styles.cardTitle}>Create your profile</h2>
            <p className={styles.cardBody}>
              Give Alik enough context to personalize plans and drafts.
            </p>
            <form className={styles.form} onSubmit={handleProfileSave}>
              <label className={styles.field}>
                <span>Display name (required)</span>
                <input
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="Jordan Montee"
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Role</span>
                <input
                  value={role}
                  onChange={(event) => {
                    setRole(event.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="Founder"
                />
              </label>
              <label className={styles.field}>
                <span>Organization</span>
                <input
                  value={organization}
                  onChange={(event) => {
                    setOrganization(event.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="Jariv"
                />
              </label>
              <label className={styles.field}>
                <span>Timezone</span>
                <input
                  value={timezone}
                  onChange={(event) => {
                    setTimezone(event.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder="Europe/Paris"
                />
              </label>
              <label className={styles.field}>
                <span>Notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setProfileSaved(false);
                  }}
                  rows={3}
                  placeholder="How you like Alik to help."
                />
              </label>
              <button
                type="submit"
                className={styles.secondaryButton}
                disabled={profileSaving}
              >
                {profileSaving ? "Saving..." : "Save profile"}
              </button>
              {profileSaved ? <p className={styles.successText}>Profile saved.</p> : null}
              {profileError ? <p className={styles.errorText}>{profileError}</p> : null}
            </form>
          </article>

          <article className={styles.card}>
            <p className={styles.stepTag}>Step 3</p>
            <h2 className={styles.cardTitle}>Pick trust level</h2>
            <p className={styles.cardBody}>
              Choose how independent Alik should be for side-effect actions.
            </p>
            <div className={styles.trustOptions}>
              {TRUST_OPTIONS.map((option) => {
                const selected = status.trustLevel === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={selected ? styles.trustSelected : styles.trustButton}
                    onClick={() => void handleTrustPick(option.value)}
                    disabled={trustSaving}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                );
              })}
            </div>
            <p className={styles.mutedText}>
              Current setting: <strong>{status.trustLevel}</strong> ({status.trustSource})
            </p>
            {trustError ? <p className={styles.errorText}>{trustError}</p> : null}
          </article>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.finishButton}
            disabled={!status.isComplete}
            onClick={openDashboard}
          >
            {status.isComplete ? "Enter dashboard" : "Complete all steps to continue"}
          </button>
        </footer>
      </section>
    </main>
  );
}
