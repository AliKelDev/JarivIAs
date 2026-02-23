import styles from "../dashboard.module.css";

type ProfilePanelProps = {
  profileLoading: boolean;
  profileDisplayName: string;
  profileRole: string;
  profileOrganization: string;
  profileTimezone: string;
  profileInterests: string;
  profileProjects: string;
  profileNotes: string;
  profileSaving: boolean;
  profileSaved: boolean;
  profileError: string | null;
  onChangeDisplayName: (value: string) => void;
  onChangeRole: (value: string) => void;
  onChangeOrganization: (value: string) => void;
  onChangeTimezone: (value: string) => void;
  onChangeInterests: (value: string) => void;
  onChangeProjects: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onSaveProfile: () => void;
};

export function ProfilePanel({
  profileLoading,
  profileDisplayName,
  profileRole,
  profileOrganization,
  profileTimezone,
  profileInterests,
  profileProjects,
  profileNotes,
  profileSaving,
  profileSaved,
  profileError,
  onChangeDisplayName,
  onChangeRole,
  onChangeOrganization,
  onChangeTimezone,
  onChangeInterests,
  onChangeProjects,
  onChangeNotes,
  onSaveProfile,
}: ProfilePanelProps) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Tell Alik about yourself</h2>
      {profileLoading ? (
        <p className={styles.meta}>Loading profile...</p>
      ) : (
        <>
          <label className={styles.label}>
            Your name
            <input
              className={styles.input}
              value={profileDisplayName}
              onChange={(event) => onChangeDisplayName(event.target.value)}
              placeholder="e.g. Alex"
            />
          </label>
          <div className={styles.toolsGrid}>
            <label className={styles.label}>
              Role
              <input
                className={styles.input}
                value={profileRole}
                onChange={(event) => onChangeRole(event.target.value)}
                placeholder="e.g. Founder, Student, Engineer"
              />
            </label>
            <label className={styles.label}>
              Organization
              <input
                className={styles.input}
                value={profileOrganization}
                onChange={(event) => onChangeOrganization(event.target.value)}
                placeholder="e.g. JarivIAs"
              />
            </label>
          </div>
          <label className={styles.label}>
            Timezone
            <input
              className={styles.input}
              value={profileTimezone}
              onChange={(event) => onChangeTimezone(event.target.value)}
              placeholder="e.g. America/Toronto"
            />
          </label>
          <label className={styles.label}>
            Interests (one per line)
            <textarea
              className={styles.textarea}
              value={profileInterests}
              onChange={(event) => onChangeInterests(event.target.value)}
              placeholder={"AI\nstartups\nmusic"}
            />
          </label>
          <label className={styles.label}>
            Ongoing projects (one per line)
            <textarea
              className={styles.textarea}
              value={profileProjects}
              onChange={(event) => onChangeProjects(event.target.value)}
              placeholder={"Building JarivIAs, an agentic AI portal"}
            />
          </label>
          <label className={styles.label}>
            Anything else Alik should know
            <textarea
              className={styles.textarea}
              value={profileNotes}
              onChange={(event) => onChangeNotes(event.target.value)}
              placeholder="e.g. I prefer concise replies, don't schedule things on weekends without asking"
            />
          </label>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.runButton}
              onClick={onSaveProfile}
              disabled={profileSaving}
            >
              {profileSaving ? "Saving..." : "Save profile"}
            </button>
          </div>
          {profileSaved ? (
            <p className={styles.meta}>Profile saved. Alik will use this from her next run.</p>
          ) : null}
          {profileError ? <p className={styles.error}>{profileError}</p> : null}
        </>
      )}
    </section>
  );
}
