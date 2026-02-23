import styles from "../dashboard.module.css";

type SlackIntegrationPanelProps = {
  slackToken: string;
  slackHasToken: boolean;
  slackChecking: boolean;
  slackSaving: boolean;
  slackSaved: boolean;
  slackError: string | null;
  onChangeSlackToken: (value: string) => void;
  onSaveSlackToken: () => void;
};

export function SlackIntegrationPanel({
  slackToken,
  slackHasToken,
  slackChecking,
  slackSaving,
  slackSaved,
  slackError,
  onChangeSlackToken,
  onSaveSlackToken,
}: SlackIntegrationPanelProps) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Integrations</h2>
      <label className={styles.label}>
        Slack User Token (xoxp-...)
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            className={styles.input}
            type="password"
            value={slackToken}
            onChange={(event) => onChangeSlackToken(event.target.value)}
            placeholder={
              slackChecking
                ? "Checking..."
                : slackHasToken
                ? "•••••••••••••••• (Connected)"
                : "Connect your Slack workspace"
            }
          />
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onSaveSlackToken}
            disabled={slackSaving}
            style={{ whiteSpace: "nowrap" }}
          >
            {slackSaving
              ? "Saving..."
              : slackHasToken && !slackToken.trim()
              ? "Disconnect"
              : "Save"}
          </button>
        </div>
      </label>
      <p className={styles.meta}>
        Get a User Token from https://api.slack.com/apps. Required scopes:{" "}
        <code>channels:history</code>, <code>channels:read</code>,{" "}
        <code>groups:history</code>, <code>groups:read</code>
      </p>
      {slackSaved ? (
        <p className={styles.meta}>
          Slack connected successfully. Alik can now read channels.
        </p>
      ) : null}
      {slackError ? <p className={styles.error}>{slackError}</p> : null}
    </section>
  );
}
