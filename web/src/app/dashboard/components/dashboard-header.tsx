import type { DashboardClientProps } from "../types";
import styles from "../dashboard.module.css";

type DashboardHeaderProps = {
  user: DashboardClientProps["user"];
  onSignOut: () => void;
};

export function DashboardHeader({ user, onSignOut }: DashboardHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <p className={styles.kicker}>Agent Workspace</p>
        <h1 className={styles.title}>Alik Control Deck</h1>
        <p className={styles.meta}>
          {user.name || user.email || user.uid} · {user.uid}
        </p>
      </div>
      <button type="button" className={styles.logoutButton} onClick={onSignOut}>
        Sign out
      </button>
    </header>
  );
}
