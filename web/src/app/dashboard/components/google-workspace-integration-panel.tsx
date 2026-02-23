import type { GoogleIntegrationStatus } from "../types";
import styles from "../dashboard.module.css";

type GoogleWorkspaceIntegrationPanelProps = {
  integrationLoading: boolean;
  workspaceLoading: boolean;
  integrationError: string | null;
  integration: GoogleIntegrationStatus | null;
  pulseReady: boolean;
  onRefreshWorkspace: () => void;
  formatScopeLabel: (scope: string) => string;
};

export function GoogleWorkspaceIntegrationPanel({
  integrationLoading,
  workspaceLoading,
  integrationError,
  integration,
  pulseReady,
  onRefreshWorkspace,
  formatScopeLabel,
}: GoogleWorkspaceIntegrationPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Google Workspace Integration</h2>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onRefreshWorkspace}
          disabled={integrationLoading || workspaceLoading}
        >
          {integrationLoading ? "Checking..." : "Refresh workspace"}
        </button>
      </div>
      {integrationLoading ? <p className={styles.meta}>Checking status...</p> : null}
      {integrationError ? <p className={styles.error}>{integrationError}</p> : null}
      {!integrationLoading && !integrationError ? (
        <>
          <p className={styles.meta}>
            {integration?.connected
              ? `Connected as ${integration.accountEmail || "unknown account"}`
              : "Not connected yet."}
          </p>
          <div className={styles.buttonRow}>
            <a className={styles.linkButton} href="/api/oauth/google/start?returnTo=/dashboard">
              {integration?.connected ? "Reconnect Google" : "Connect Google"}
            </a>
          </div>
          {integration?.connected && integration.scopes?.length ? (
            <div className={styles.scopeList}>
              {integration.scopes.map((scope) => (
                <span key={scope} className={styles.scopeChip}>
                  {formatScopeLabel(scope)}
                </span>
              ))}
            </div>
          ) : null}
          {integration?.connected && !pulseReady ? (
            <p className={styles.error}>
              Reconnect Google to grant `gmail.readonly` and `calendar.readonly`
              so Alik can show inbox and calendar context.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
