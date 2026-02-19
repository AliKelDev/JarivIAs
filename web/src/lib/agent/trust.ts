import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export const AGENT_TRUST_LEVELS = [
  "supervised",
  "delegated",
  "autonomous",
] as const;

export type AgentTrustLevel = (typeof AGENT_TRUST_LEVELS)[number];

export type AgentTrustLevelSource = "settings" | "profile_fallback" | "default";

export type AgentTrustLevelReadResult = {
  trustLevel: AgentTrustLevel;
  source: AgentTrustLevelSource;
};

const DEFAULT_AGENT_TRUST_LEVEL: AgentTrustLevel = "supervised";
const TRUST_LEVEL_FIELD = "trustLevel";

function settingsRef(uid: string) {
  return getFirebaseAdminDb()
    .collection("users")
    .doc(uid)
    .collection("settings")
    .doc("agent_policy");
}

function userRef(uid: string) {
  return getFirebaseAdminDb().collection("users").doc(uid);
}

export function isAgentTrustLevel(value: unknown): value is AgentTrustLevel {
  return (
    value === "supervised" || value === "delegated" || value === "autonomous"
  );
}

function readProfileTrustLevelFallback(value: unknown): AgentTrustLevel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = record[TRUST_LEVEL_FIELD];
  if (isAgentTrustLevel(direct)) {
    return direct;
  }

  const agentTrustLevel = record.agentTrustLevel;
  if (isAgentTrustLevel(agentTrustLevel)) {
    return agentTrustLevel;
  }

  const profileValue = record.profile;
  if (
    profileValue &&
    typeof profileValue === "object" &&
    !Array.isArray(profileValue)
  ) {
    const profileRecord = profileValue as Record<string, unknown>;
    const nested = profileRecord[TRUST_LEVEL_FIELD];
    if (isAgentTrustLevel(nested)) {
      return nested;
    }
  }

  return null;
}

export async function readAgentTrustLevel(
  uid: string,
): Promise<AgentTrustLevelReadResult> {
  const settingsSnapshot = await settingsRef(uid).get();
  if (settingsSnapshot.exists) {
    const trustLevel = settingsSnapshot.get(TRUST_LEVEL_FIELD);
    if (isAgentTrustLevel(trustLevel)) {
      return { trustLevel, source: "settings" };
    }
  }

  const userSnapshot = await userRef(uid).get();
  if (userSnapshot.exists) {
    const fallbackTrustLevel = readProfileTrustLevelFallback(userSnapshot.data());
    if (fallbackTrustLevel) {
      return { trustLevel: fallbackTrustLevel, source: "profile_fallback" };
    }
  }

  return { trustLevel: DEFAULT_AGENT_TRUST_LEVEL, source: "default" };
}

export async function getAgentTrustLevel(uid: string): Promise<AgentTrustLevel> {
  const { trustLevel } = await readAgentTrustLevel(uid);
  return trustLevel;
}

export async function setAgentTrustLevel(params: {
  uid: string;
  trustLevel: AgentTrustLevel;
}) {
  const { uid, trustLevel } = params;
  await settingsRef(uid).set(
    {
      [TRUST_LEVEL_FIELD]: trustLevel,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

