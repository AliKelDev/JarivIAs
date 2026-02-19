import {
  isRecipientAlwaysAllowed,
  isValidEmailAddress,
  normalizeEmailAddress,
} from "@/lib/tools/gmail";
import { getAgentTrustLevel } from "@/lib/agent/trust";
import type {
  AgentPolicyDecision,
  AgentToolArgs,
  AgentToolDefinition,
} from "@/lib/agent/types";

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) {
    return defaultValue;
  }
  return value === "1" || value === "true" || value === "yes";
}

function sideEffectsEnabled(): boolean {
  return readBooleanEnv("AGENT_SIDE_EFFECTS_ENABLED", true);
}

export async function evaluateAgentToolPolicy(params: {
  uid: string;
  tool: AgentToolDefinition;
  args: AgentToolArgs;
}): Promise<AgentPolicyDecision> {
  const { uid, tool, args } = params;

  if (tool.sideEffect && !sideEffectsEnabled()) {
    return {
      mode: "deny",
      reason: "Agent side-effect tools are disabled by configuration.",
    };
  }

  const trustLevel = await getAgentTrustLevel(uid);

  if (tool.sideEffect && trustLevel === "supervised") {
    return {
      mode: "require_approval",
      reason:
        "Trust level is supervised: side-effect actions always require approval.",
    };
  }

  if (tool.sideEffect && trustLevel === "autonomous") {
    return {
      mode: "allow",
      reason:
        "Trust level is autonomous: side-effect action is allowed without approval.",
    };
  }

  if (tool.name === "gmail_send") {
    const toValue = args.to;
    if (typeof toValue !== "string") {
      return {
        mode: "deny",
        reason: "gmail_send.to must be a string.",
      };
    }

    const normalizedTo = normalizeEmailAddress(toValue);
    if (!isValidEmailAddress(normalizedTo)) {
      return {
        mode: "deny",
        reason: "gmail_send.to must be a valid email address.",
      };
    }

    const alwaysAllowed = await isRecipientAlwaysAllowed({
      uid,
      email: normalizedTo,
    });

    if (alwaysAllowed) {
      return {
        mode: "allow",
        reason:
          "Trust level is delegated and recipient is in the allowlist for automatic send.",
      };
    }

    return {
      mode: "require_approval",
      reason:
        "Trust level is delegated: gmail_send requires approval for non-allowlisted recipients.",
    };
  }

  if (tool.sideEffect) {
    return {
      mode: "require_approval",
      reason: `Trust level is delegated: ${tool.name} requires approval.`,
    };
  }

  return {
    mode: "allow",
    reason: `Tool is non-destructive and allowed by default policy (trust level: ${trustLevel}).`,
  };
}
