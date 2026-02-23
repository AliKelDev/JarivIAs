import { useCallback, useState } from "react";
import type { AgentTrustLevel, AgentTrustLevelResponse } from "../types";

function isAgentTrustLevelResponse(
  value: unknown,
): value is AgentTrustLevelResponse {
  if (!value || typeof value !== "object" || !("trustLevel" in value)) {
    return false;
  }

  const trustLevel = (value as AgentTrustLevelResponse).trustLevel;
  return (
    trustLevel === "supervised" ||
    trustLevel === "delegated" ||
    trustLevel === "autonomous"
  );
}

function readErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  if ("error" in value && typeof value.error === "string" && value.error.trim()) {
    return value.error;
  }

  return fallback;
}

type UseAgentTrustParams = {
  formatTrustLevelLabel: (level: AgentTrustLevel) => string;
};

export function useAgentTrust(params: UseAgentTrustParams) {
  const { formatTrustLevelLabel } = params;

  const [agentTrustLevel, setAgentTrustLevel] =
    useState<AgentTrustLevel>("supervised");
  const [agentTrustLevelSource, setAgentTrustLevelSource] = useState<string | null>(
    null,
  );
  const [agentTrustLoading, setAgentTrustLoading] = useState(true);
  const [agentTrustSubmitting, setAgentTrustSubmitting] = useState(false);
  const [agentTrustError, setAgentTrustError] = useState<string | null>(null);
  const [agentTrustMessage, setAgentTrustMessage] = useState<string | null>(null);

  const refreshAgentTrustLevel = useCallback(async () => {
    setAgentTrustLoading(true);
    setAgentTrustError(null);

    try {
      const response = await fetch("/api/agent/trust-level", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | AgentTrustLevelResponse
        | { error?: string; source?: string }
        | null;

      if (!response.ok || !isAgentTrustLevelResponse(body)) {
        throw new Error(
          readErrorMessage(body, "Failed to load agent trust level."),
        );
      }

      setAgentTrustLevel(body.trustLevel);
      setAgentTrustLevelSource(
        typeof body.source === "string" ? body.source : null,
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load trust settings.";
      setAgentTrustError(message);
    } finally {
      setAgentTrustLoading(false);
    }
  }, []);

  const setTrustLevel = useCallback(
    async (nextTrustLevel: AgentTrustLevel) => {
      if (agentTrustSubmitting || nextTrustLevel === agentTrustLevel) {
        return;
      }

      setAgentTrustSubmitting(true);
      setAgentTrustError(null);
      setAgentTrustMessage(null);

      try {
        const response = await fetch("/api/agent/trust-level", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trustLevel: nextTrustLevel }),
        });

        const body = (await response.json().catch(() => null)) as
          | AgentTrustLevelResponse
          | { error?: string }
          | null;

        if (!response.ok || !isAgentTrustLevelResponse(body)) {
          throw new Error(
            readErrorMessage(body, "Failed to update trust level."),
          );
        }

        setAgentTrustLevel(body.trustLevel);
        setAgentTrustLevelSource("settings");
        setAgentTrustMessage(
          `Autonomy mode set to ${formatTrustLevelLabel(body.trustLevel)}.`,
        );
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to update trust level.";
        setAgentTrustError(message);
      } finally {
        setAgentTrustSubmitting(false);
      }
    },
    [agentTrustLevel, agentTrustSubmitting, formatTrustLevelLabel],
  );

  return {
    agentTrustLevel,
    agentTrustLevelSource,
    agentTrustLoading,
    agentTrustSubmitting,
    agentTrustError,
    agentTrustMessage,
    refreshAgentTrustLevel,
    setTrustLevel,
  };
}
